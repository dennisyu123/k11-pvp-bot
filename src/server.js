const characterMap = require('./config/character').characterMap
let nickNameMap = require('./config/nick-name').nickNameMap

const datasource = require('./datasource')
const crypto = require("crypto")
const Discord = require('discord.js')
const client = new Discord.Client()
const firestore = require('./firestore')
const http = require('http')
const express = require('express')
const app = express()

let queryCache = {}
let battleImage = {}
let intervalTask = {}
const cacheTime = 43200 * 1000 // Data will be cached 12 hours

const PORT = process.env.PORT || 5000

app.get('/', function (req, res) {
    const used = process.memoryUsage()
    res.send(JSON.stringify(used))
})

app.listen(PORT, function () {
    console.log(`k11-dc-bot app listening on port ${PORT}.`)
})

client.login(process.env.DC_TOKEN)

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`)

    let nc = await firestore.database.get(`config`, `nick-name`)
    if(nc.data() != undefined) {
        nickNameMap = JSON.parse(nc.data().zh)
    }

    // update system metrics and remove old cache every 20 minutes
    intervalTask = setInterval(async () => { 
        printSystemMessage()

        http.get('https://k11-pvp-bot.herokuapp.com/', (res) => {
            res.setEncoding('utf8')
            res.on('data', function (body) {
                console.log(body)
            })
        })
    }, 1200 * 1000)
    printSystemMessage()
})

client.on('message',  async (msg) => {

    // 全型字
    msg.content = msg.content.replace(`！`, '!')

    if(msg.author.bot || msg.channel.type == `dm`) {
        return
    }

    if(msg.content.startsWith(`!指令`)){
        msg.reply('\n!陣 {別名} {別名} {別名} {別名} {別名}\n!別名 {系統原名} {新名}')
        return
    }

    if(msg.content.startsWith(`!system`)){
        clearInterval(intervalTask)
        intervalTask = setInterval(async () => { 
            printSystemMessage()
        }, 3600 * 1000)
        printSystemMessage()
    }

    // store image url
    if(msg.content.startsWith('!圖 ')) {

        let attechment = msg.attachments.array()
        let queryMessage = msg.content
        let team = queryMessage.trim().replace(`!圖 `,``).trim()

        let teamQuery = team.trim().split(' ')
        if(teamQuery.length != 5) {
            msg.reply('隊伍最少要有 5 個角色')
            return
        }

        let userId = msg.author.id

        let userImage = {} 
        if(attechment[0] === undefined) {
            msg.reply('請上傳相關戰報')
            return
        }
        userImage[userId] = attechment[0].attachment

        let found = true

        let jpTeamArray = []

        teamQuery.forEach(t => {
            if(characterMap[nickNameMap[t]] === undefined && found) {
                msg.reply(`找不到 ${t} 這個角色`)
                found = false
            }
            else {
                jpTeamArray.push(characterMap[nickNameMap[t]][0])
            }
        })
        if(found == false) {
            return
        }
        let hash = crypto.createHash(`sha1`).update(JSON.stringify(jpTeamArray)).digest(`hex`)

        if(battleImage[hash] == undefined) {
            let bicol = await firestore.database.get(`battleImage`, hash)
            battleImage[hash] = bicol.data()
        }
        
        let savedImage = battleImage[hash]

        if(savedImage === undefined) {
            battleImage[hash] = userImage
        }
        else {
            battleImage[hash][userId] = attechment[0].attachment
        }

        firestore.database.store(`battleResult`, hash, userImage).then(()=>{
            msg.react(`👍`)
            console.log(`${new Date()} battleResult ${hash} is stored to firestore`)
        })
        return
    }

    //new nick mame: !別名:{系統原名},{新名} e.g. !別名 佩可 飯糰
    if(msg.content.startsWith('!別名')) {
        let queryMessage = msg.content
        let team = queryMessage.trim().replace(`!別名`,``)
        let names = team.trim().split(' ')
        if(names.length != 2) {
            msg.reply('新增名稱最少要有 2 參數')
            return
        }
        //search zh name get id
        let cid = getArrayKeyByZH(characterMap, names[0])
        if(cid === undefined) {
            if(nickNameMap[names[0].trim()] === undefined) {
                msg.reply(`找不到 ${names[0]} 這個角色`)
                return
            }
            else {
                cid = nickNameMap[names[0].trim()]
            }
        }

        // store 
        nickNameMap[names[1].trim()] = parseInt(cid)
        msg.reply(`已新增別名 ${names[1]}`)

        firestore.database.store(`config`, `nick-name`, {zh: JSON.stringify(nickNameMap)}).then(()=>{
            console.log(`已新增別名 ${names[1]}`)
        })
        return
    }

    if (msg.content.startsWith('!陣 ')) {

        let queryMessage = msg.content
        let team = queryMessage.trim().replace(`!陣 `,``)
        let userId = msg.author.id

        let teamQuery = team.trim().split(' ')
        if(teamQuery.length != 5) {
            msg.reply('隊伍最少要有 5 個角色')
            return
        }
        let found = true

        let jpTeamArray = []

        teamQuery.forEach(t => {
            if(characterMap[nickNameMap[t]] === undefined && found) {
                msg.reply(`找不到 ${t} 這個角色`)
                found = false
            }
            else {
                jpTeamArray.push(characterMap[nickNameMap[t]][0])
            }
        })
        if(found == false) {
            return
        }

        let shallGetDataFromSource = true
        let isCache = false
        let hash = crypto.createHash(`sha1`).update(JSON.stringify(jpTeamArray)).digest(`hex`)

        //not found in local memory, try to get it from db
        if(queryCache[hash] == undefined) {
            let atkcol = await firestore.database.get(`atkId`, hash)
            queryCache[hash] = atkcol.data()
        }

        //found in db / memory
        if(queryCache[hash] != undefined) {
            isCache = true
            let currentTime = new Date().getTime()
            let dataTime = queryCache[hash].timestamp + cacheTime
            if(dataTime > currentTime) {
                shallGetDataFromSource = false
            }
        }

        if(shallGetDataFromSource) {
            const response = await datasource.fetch(jpTeamArray, 0)
            
            if(response === undefined) {
                if(isCache == false) {
                    let embed = await convertToEmbedMessage(userId, hash, team.trim(), true)
                    msg.channel.send(embed)
                    return
                }
                // return cache result
            }
            else {
                //update cache
                let data = convertToChineseResult(response.body)
                queryCache[hash] = {
                    timestamp : new Date().getTime(),
                    result: data
                }

                firestore.database.store(`atkId`, hash, {
                    timestamp : new Date().getTime(),
                    result: data
                })
                .then(()=>{
                    console.log(`${new Date()} atkId ${hash} is stored to firestore`)
                })
            }
        }
        let embed = await convertToEmbedMessage(userId, hash, team.trim(), false)
        msg.channel.send(embed)
        return
    }
})

const convertToChineseResult = (result) => {
    let chineseResult = []
    let idx = 0
    result.forEach(entry => {
        if(idx > 4) {
            return
        }
        idx = idx + 1
        let atk = entry.atk
        let atkCharacterList = atk.split(`/`)
        let teamMember = []
        atkCharacterList.forEach(cha => {
            let jp = cha.split(`,`)
            let id = getArrayKeyByValue(characterMap, jp[0])
            let zh = characterMap[parseInt(id)]
            if(zh === undefined) {
                return
            }
            teamMember.push(zh[1])
        })
        let entryResult = {
            id: entry.id,
            good: entry.good,
            bad: entry.bad,
            team: teamMember,
            updated: entry.updated
        }
        chineseResult.push(entryResult)
    })
    return chineseResult
}
const convertToEmbedMessage = async (userId, hash, title, isBusy) => {
    let cached = queryCache[hash]
    let chineseResult = cached == undefined ? [] : queryCache[hash].result

    const embed = new Discord.MessageEmbed()
    .setColor('#0099ff')
    .setAuthor(title, 'https://na.cx/i/tbpW6vP.png', 'https://nomae.net/arenadb/')
    .setThumbnail('https://na.cx/i/tbpW6vP.png')

    if(chineseResult.length == 0) {
        if(isBusy){
            embed.setDescription(`伺服器忙碌 , 請重新查詢`)
        }
        else {
            embed.setDescription(`伺服器暫無記錄`)
        }
    }
    else {
        chineseResult.forEach(r => {
            let date = new Date(Date.parse(r.updated))
            let month = date.getMonth() + 1
            let day = date.getDate()
            embed.addFields(
                { name: `${r.team.toString()}`, value: `:thumbsup: ${r.good} :thumbsdown: ${r.bad} :calendar_spiral: ${day}/${month}`, inline: false }
            )
        })
    }

    //Attech image if someone uploaded before
    if(battleImage[hash] == undefined) {
        let bicol = await firestore.database.get(`battleResult`, hash)
        battleImage[hash] = bicol.data()
    }
    
    let images = battleImage[hash]
    let defaultImage = undefined

    if (images != null) {
        for (const [key, value] of Object.entries(images)) {

            if(defaultImage === undefined) {
                defaultImage = value
            }

            if(userId == key) {
                defaultImage = value
            }
        }
        if(defaultImage != undefined) {
            embed.setImage(defaultImage)
        }
    }
    return embed
}
const getArrayKeyByZH = (object, value) => {
    return Object.keys(object).find(key => object[key][1] === value)
}
const getArrayKeyByValue = (object, value) => {
    return Object.keys(object).find(key => object[key][0] === value)
}
const removeOldCache = () => {
    let removeList = []
    for (const [key, value] of Object.entries(queryCache)) {
        try {
            let currentTime = new Date().getTime()
            let dataTime = value.timestamp + cacheTime
            if(dataTime < currentTime) {
                removeList.push(key)
            }
        }
        catch (err) {
            console.log(`${key} does not have timestamp`)
        }
    }
    removeList.forEach(key => {
        delete queryCache[key]
        delete battleImage[key]
    })
}
const printSystemMessage = async () => {
    const used = process.memoryUsage()
    let status = `Memory usage\n\n`
    for (let key in used) {
        status = status + `${key} ${Math.round(used[key] / 1024 / 1024 * 100) / 100} MB \n`
    }
    removeOldCache()
    const cachedItem = Object.keys(queryCache).length + Object.keys(battleImage).length
    status = status + `cached items ${cachedItem}\n\nLast update: ${new Date()}`

    let channel = client.channels.cache.get("695986571492589634")
    let msg = await channel.messages.fetch('769224175708667916')

    msg.edit(status)
}
