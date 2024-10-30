const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const snmp = require('typed-snmp-native');

const app = express();

app.use(cors());
app.use(bodyParser.json());

const hosts = [];

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method}:${req.url}`);
    next();
});

app.get('/snmp/:host/interfaces', (req, res) => {
    const { host } = req.params;
    const session = new snmp.Session({ host, community: 'public' });

    const getInterfaces = new Promise((resolve, reject) => {
        session.getSubtree({ oid: '' }, (error, varbinds) => {
            if (err) return reject(err)

            try {
                const oid = varbinds?.map(({ oid }) => Array.isArray(oid) ? oid.join('.') : oid)
    
                const obj = {
                    int_id: '1.3.6.1.2.1.2.2.1.1.',
                    int: '1.3.6.1.2.1.2.2.1.2.',
                    status: '1.3.6.1.2.1.2.2.1.7.'
                }
    
                const int_ids = oid?.filter(Boolean).filter((o) => o.startsWith(obj.int_id))
                
                // get interface values from int_ids
                const res = int_ids?.map((int_id, index) => {
                    const varbind = varbinds
                        ?.map(({ oid, value }) => ({ oid: Array.isArray(oid) ? oid.join('.') : oid, value }))
                    
                    const int = varbind?.find(({ oid }) => oid === `${obj.int}${index + 1}`)?.value
                    
                    const status = varbind?.find(({ oid }) => oid === `${obj.status}${index + 1}`)?.value
                    
                    return {
                        int_id: int_id.replace(`${obj.int_id}`, ''),
                        int,
                        status: typeof status === 'number' ? status === 1 ? 'up' : 'down' : status
                    }
                })
    
                if (res && res.length > 0) {
                    session.close()
                    resolve(res)
                } else {
                    session.close()
                    reject(new Error("No interface data found"))
                }
            } catch (error) {
                reject(error)
            }
        });
    });

    return getInterfaces
        .then(res.status(200).json)
        .catch((error) => res.status(500).json({ error: error.message }))
})

app.patch('/snmp/:host/:int/:status', (req, res) => {
    const { host, int, status } = req.params;
    const session = new snmp.Session({ host, community: 'public' });

    if (status !== 'up' && status !== 'down') {
        return res.status(400).json({ error: 'Invalid status' })
    }

    return new Promise((resolve, reject) => {
        session.set({
            oid: `.1.3.6.1.2.1.2.2.1.7.${int}`,
            value: status === 'up' ? 1 : 2,
            type: 2
        }, (err) => {
            if (err) return reject(err)

            resolve({ message: 'success', data: {
                int,
                status
            }})
        })
    })
        .then(res.status(200).json)
        .catch((error) => res.status(500).json({ error: error.message }))
})

app.listen(5001, () => console.log('Server running on port 5001'));