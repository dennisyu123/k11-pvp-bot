const admin = require('firebase-admin')
const serviceAccount = require('./config/service-account.json')

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
