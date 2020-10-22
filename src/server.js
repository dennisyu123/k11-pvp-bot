const characterMap = require('./config/character').characterMap
let nickNameMap = require('./config/nick-name').nickNameMap

const botToken = require('./token')
const datasource = require('./datasource')
const crypto = require("crypto")
const Discord = require('discord.js')
const client = new Discord.Client()
const firestore = require('./firestore')

let queryCache = {}
let battleImage = {}

const cacheTime = 3600 * 1000 // Data will be cached 1 hour

client.login(botToken.token)

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`)

    let nc = await firestore.database.get(`config`, `nick-name`)
    if(nc.data() != undefined) {
        nickNameMap = JSON.parse(nc.data().zh)
    }
})

client.on('message',  async (msg) => {

    // 全型字
    msg.content = msg.content.replace(`！`, '!')

    if(msg.author.bot || msg.channel.type == `dm`) {
        return
    }
    if(msg.content.startsWith(`!mem`)) {
        const used = process.memoryUsage()
        let mem = ``
        for (let key in used) {
            mem = mem + `${key} ${Math.round(used[key] / 1024 / 1024 * 100) / 100} MB \n`
        }
        msg.channel.send(mem)
    }
    if(msg.content.startsWith(`!指令`)){
        msg.reply('\n!陣 {別名} {別名} {別名} {別名} {別名}\n!別名 {系統原名} {新名}')
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
            msg.reply(`找不到 ${names[0]} 這個角色`)
            return
        }

        // store 
        nickNameMap[names[1].trim()] = parseInt(cid)
        msg.reply(`已新增別名 ${names[1]}`)

        firestore.database.store(`config`, `nick-name`, {zh: JSON.stringify(nickNameMap)}).then(()=>{
            console.log(`已新增別名 ${names[1]}`)
        })
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
                    let embed = await getBattleImageMessage(userId, hash)
                    msg.channel.send(embed)
                    return
                }
                // return cache result
            }
            else {
                //update cache
                queryCache[hash] = {
                    timestamp : new Date().getTime(),
                    result: convertToChineseResult(response.body)
                }

                firestore.database.store(`atkId`, hash, {
                    timestamp : new Date().getTime(),
                    result: convertToChineseResult(response.body)
                })
                .then(()=>{
                    console.log(`${new Date()} atkId ${hash} is stored to firestore`)
                })
            }
        }
        let embed = await convertToEmbedMessage(userId, hash)
        msg.channel.send(embed)
    }
})

async function getBattleImageMessage(userId, hash){
    const embed = new Discord.MessageEmbed()
    .setColor('#0099ff')
    .setTitle(`隊伍參考`)
    .setAuthor('進攻推薦', 'https://na.cx/i/tbpW6vP.png', 'https://nomae.net/arenadb/')
    .setThumbnail('https://na.cx/i/tbpW6vP.png')

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
            embed.setDescription(`K11 的記錄`)
        }
    }
    else {
        embed.setDescription(`伺服器忙碌 , 請重新查詢`)
    }
    return embed
}
function convertToChineseResult(result){
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
async function convertToEmbedMessage(userId, hash){
    let chineseResult = queryCache[hash].result

    const embed = new Discord.MessageEmbed()
    .setColor('#0099ff')
    .setAuthor('進攻推薦隊伍參考', 'https://na.cx/i/tbpW6vP.png', 'https://nomae.net/arenadb/')
    .setThumbnail('https://na.cx/i/tbpW6vP.png')

    if(chineseResult.length == 0) {
        embed.setDescription(`伺服器暫無記錄`)
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
function getArrayKeyByZH(object, value) {
    return Object.keys(object).find(key => object[key][1] === value)
}
function getArrayKeyByValue(object, value) {
    return Object.keys(object).find(key => object[key][0] === value)
}