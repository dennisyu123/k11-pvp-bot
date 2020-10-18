const superagent = require('superagent')

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

exports.fetch = async (teamQuery, characterMap, nickNameMap, retryNumber) => {
    if(retryNumber > 3) {
        return undefined
    }

    try {
        const response = await superagent.post('https://nomae.net/princess_connect/public/_arenadb/receive.php')
        .type('form')
        .field('type', 'search')
        .field('userid', '0')
        .field('public', '1')
        .field('page', '0')
        .field('sort', '0')
        .field('def[]', characterMap[nickNameMap[teamQuery[0]]][0])
        .field('def[]', characterMap[nickNameMap[teamQuery[1]]][0])
        .field('def[]', characterMap[nickNameMap[teamQuery[2]]][0])
        .field('def[]', characterMap[nickNameMap[teamQuery[3]]][0])
        .field('def[]', characterMap[nickNameMap[teamQuery[4]]][0])
        .set({
            'content-type': 'multipart/form-data',
            'x-from': 'https://nomae.net/arenadb/'
        })
        return response
    }
    catch (err) {
        retryNumber = retryNumber + 1
        await sleep(1000)
        return await this.fetch(teamQuery, characterMap, nickNameMap, retryNumber)
    }
}