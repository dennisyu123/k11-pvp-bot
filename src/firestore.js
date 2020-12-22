const admin = require('firebase-admin')
const serviceAccount = JSON.parse(Buffer.from(process.env.GOOGLE_CONFIG_BASE64, 'base64').toString('ascii'))

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
})

const db = admin.firestore()

const store = async (collection, docId, data) => {
    const docRef = db.collection(collection).doc(docId)
    return await docRef.set(data, {merge: true})
}

const get = async (collection, docId) => {
    return await db.collection(collection).doc(docId).get()
}

exports.database = {
    store : store,
    get: get
}
