const superagent = require('superagent')

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

exports.fetch = async (jpTeamArray, retryNumber) => {
    if(retryNumber > 3) {
        console.log(`Reach retry limit, stop fetching data from website`)
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
        .field('def[]', jpTeamArray[0])
        .field('def[]', jpTeamArray[1])
        .field('def[]', jpTeamArray[2])
        .field('def[]', jpTeamArray[3])
        .field('def[]', jpTeamArray[4])
        .set({
            'content-type': 'multipart/form-data',
            'x-from': 'https://nomae.net/arenadb/'
        })
        return response
    }
    catch (err) {
        retryNumber = retryNumber + 1
        await sleep(1000)
        return await this.fetch(jpTeamArray, retryNumber)
    }
}