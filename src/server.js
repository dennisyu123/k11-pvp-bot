const characterMap = require('./config/character').characterMap
let nickNameMap = require('./config/nick-name').nickNameMap

const botToken = require('./token')
const datasource = require('./datasource')
const fs = require('fs')

const Discord = require('discord.js')
const client = new Discord.Client();

let queryCache = {}
let battleImage = {}

const cacheTime = 3600 * 1000 // Data will be cached 1 hour

//nickName file location
const NICKNAME_FILE_LOCATION = `./src/data/nickName.json`

//queryCache file location
const QUERY_CACHE_LOCATION = `./src/data/queryCache`

//battleImage
const BATTLE_IMAGE_LOCATION = `./src/data/battleImage`

client.login(botToken.token)

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`)
})

client.on('message',  async (msg) => {

    // 全型字
    msg.content = msg.content.replace(`！`, '!')

    if(msg.author.bot || msg.channel.type == `dm`) {
        return
    }
    if(msg.content.startsWith(`!指令`)){
        msg.reply('\n!陣 {別名} {別名} {別名} {別名} {別名}\n!別名 {系統原名} {新名}')
    }

    // store image url
    if(msg.content.startsWith('!圖 ')) {

        let attechment = msg.attachments.array()
        let queryMessage = msg.content
        let team = queryMessage.trim().replace(`!圖 `,``).trim()

        let userId = msg.author.id

        let userImage = {} 
        userImage[userId] = attechment[0].attachment

        let savedImage = battleImage[team]

        if(savedImage === undefined) {
            battleImage[team] = userImage
        }
        else {
            battleImage[team][userId] = attechment[0].attachment
        }

        fs.writeFile(BATTLE_IMAGE_LOCATION, JSON.stringify(battleImage), 'utf8', ()=>{})
    }

    //new nick mame: !別名:{系統原名},{新名} e.g. !別名 佩可 飯糰
    if(msg.content.startsWith('!別名')) {
        let queryMessage = msg.content
        let team = queryMessage.trim().replace(`!別名`,``)
        let teamQuery = team.trim().split(' ')
        if(teamQuery.length != 2) {
            msg.reply('新增名稱最少要有 2 參數')
            return
        }
        //search zh name get id
        let cid = getArrayKeyByZH(characterMap, teamQuery[0])
        if(cid === undefined) {
            msg.reply(`找不到 ${teamQuery[0]} 這個角色`)
            return
        }

        // store 
        nickNameMap[teamQuery[1].trim()] = parseInt(cid)
        msg.reply(`已新增別名 ${teamQuery[1]}`)

        fs.writeFile(NICKNAME_FILE_LOCATION, JSON.stringify(nickNameMap), 'utf8', ()=>{
            console.log(`已新增別名 ${teamQuery[1]}`)
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

        teamQuery.forEach(t => {
            if(characterMap[nickNameMap[t]] === undefined && found) {
                msg.reply(`找不到 ${t} 這個角色`)
                found = false
            }
        })
        if(found == false) {
            return
        }

        let shallGetDataFromSource = true
        let isCache = false

        if(queryCache[team] != undefined) {
            isCache = true
            let currentTime = new Date().getTime()
            let dataTime = queryCache[team].timestamp + cacheTime
            if(dataTime > currentTime) {
                shallGetDataFromSource = false
            }
        }

        if(shallGetDataFromSource) {
            const response = await datasource.fetch(teamQuery, characterMap, nickNameMap, 0)
            
            if(response === undefined) {
                if(isCache == false) {
                    msg.channel.send(getBattleImageMessage(userId, team))
                    return
                }
                // return cache result
            }
            else {
                //update cache
                queryCache[team] = {
                    timestamp : new Date().getTime(),
                    result: response.body
                }
                fs.writeFile(QUERY_CACHE_LOCATION, JSON.stringify(queryCache), 'utf8', ()=>{})
            }
        }
        msg.channel.send(convertToEmbedMessage(userId, team, queryCache[team]))
    }
})
//Restore cache 
fs.readFile(QUERY_CACHE_LOCATION, 'utf8', (err, data) => {
    if (err){
        console.log(err)
    } 
    else {
        queryCache = JSON.parse(data)
    }
})

//Read nickName file
fs.readFile(NICKNAME_FILE_LOCATION, 'utf8', (err, data) => {
    if (err){
        console.log(err)
    } 
    else {
        nickNameMap = JSON.parse(data)
    }
})

//Read battle Image
fs.readFile(BATTLE_IMAGE_LOCATION, 'utf8', (err, data) => {
    if (err){
        console.log(err)
    } 
    else {
        battleImage = JSON.parse(data)
    }
})
function getBattleImageMessage(userId, team){
    const embed = new Discord.MessageEmbed()
    .setColor('#0099ff')
    .setTitle(`隊伍參考`)
    .setAuthor('進攻推薦', 'https://na.cx/i/tbpW6vP.png', 'https://nomae.net/arenadb/')
    .setThumbnail('https://na.cx/i/tbpW6vP.png')

    //Attech image if someone uploaded before
    let images = battleImage[team]
    let defaultImage = undefined

    if (images != null) {
        for (const [key, value] of Object.entries(images)) {
            defaultImage = value
            if(userId == key) {
                defaultImage = value
            }
        }
        if(defaultImage != undefined) {
            embed.setImage(defaultImage)
        }
    }
    else {
        embed.setDescription(`暫無記錄`)
    }
    return embed
}
function convertToEmbedMessage(userId, team, body){
    let result = body.result
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
            team: teamMember
        }
        chineseResult.push(entryResult)
    })

    const embed = new Discord.MessageEmbed()
    .setColor('#0099ff')
    .setAuthor('進攻推薦隊伍參考', 'https://na.cx/i/tbpW6vP.png', 'https://nomae.net/arenadb/')
    .setThumbnail('https://na.cx/i/tbpW6vP.png')

    chineseResult.forEach(r => {
        embed.addFields(
            { name: `${r.team.toString()}`, value: `:thumbsup: ${r.good} :thumbsdown: ${r.bad}`, inline: false }
        )
    })

    //Attech image if someone uploaded before
    let images = battleImage[team]
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