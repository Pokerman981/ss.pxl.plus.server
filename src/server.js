const express = require('express');
const cors = require('cors');
const router = express.Router();
const https = require('https');
const fs = require('fs');
const app = express();
const jwt = require('jsonwebtoken');
const bodyparser = require('body-parser');
const mysql = require('mysql');
const path = require('path');

keyPath = '/etc/letsencrypt/live/ss.pxl.plus/privkey.pem';
certPath = '/etc/letsencrypt/live/ss.pxl.plus/fullchain.pem';
domain = 'ss.pxl.plus';
port = 420;

const options = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
};

const availableServers = [
    'dash',
    'club',
    'legends',
    'brawl',
    'verse'
];

const mysqlConfig = {
    host: 'localhost',
    user:'ss.pxl.plus.server',
    password: 'Gy9jG208omZ24H7M',
    database: 'ss.pxl.plus.server'
};

const mysqlPool = mysql.createPool(mysqlConfig);

const privatePath = 'assets/jwtRS512.key';
const pubPath = 'assets/jwtRS512.key.pub';
const httpsServer = https.createServer(options, app);


app.use(cors());
app.use(bodyparser.json());


registerRoutes().then(() => {

});
app.use('/', router);

httpsServer.listen(port, domain);
console.log(`Server running at ${domain + ':' + port}`);

let date = getFormattedDate();
let timer = setInterval(() => {
    calculateTotals();
    console.log('Calc Totals Called');
}, 25000 * 1000); // 50000


async function registerRoutes() {
    router.all('*', (req, res, next) => {
        // console.log('New Request\n', req.headers, req.body);
        next();
    });

    router.get('/', (req, res) => {
        res.status(403).send();
    });

    router.get('/api', (req, res) => {
        //TODO Authorize
        let paths = {routes: []};
        for (let stack of router.stack) {
            const route = stack.route;

            if (route.path === '*') continue;
            if (!paths.routes.includes(route.path))
                paths.routes.push(route.path);
        }

        res.send(paths);
    });
    router.post('/api', (req, res) => {
        res.status(400).send({router: "Route method not supported"});
    });



    router.post('/api/login', (req, res) => {
        const user = req.body.username;
        const pass = req.body.password;

        if (user == null || pass == null) {
            res.status(400).send('Unable to find required data!');
            return;
        }

        mysqlPool.getConnection((err, connection) => {
            if (err) throw err;
            let sql = `SELECT * from users where username=? OR email=? AND password=?;`;
            connection.query(sql, [user, user, pass], (err2, result) => {
                if (err2) throw err2;
                if (result.length === 1) {
                    const key = fs.readFileSync(privatePath, {encoding:'utf8'});
                    jwt.sign({data:{username: result[0].username, id: result[0]['user_id'], valid: true}}, key, {expiresIn: '1d', algorithm: 'RS256'},
                        (err, token) => {
                            res.send({token: token});
                            connection.release();

                            if (err2) throw err2;
                        });
                } else {
                    connection.release();
                    res.status(401).send('Username or Password is incorrect');
                }
            });
        })
    });

    await router.get('/api/verify', async (req, res) => {
        const token = req.get('token');
        if (token == null) {
            res.status(400).send('Error: Missing Token!');
            return;
        }
        res.send(await verifyToken(token));

    });


    router.post('/api/ecotracker', (req, res) => {
         let logFile = `src/data/ecotracker_${getFormattedDate()}.json`;
        // TODO Make it so the servers can only use the route
        const server = req.get('server');
        if (server === null || !availableServers.includes(server)) {
            res.status(403).end();
            return;
        }

        // mysqlPool.getConnection((err, connection) => {
        //    if (err) throw err;
        //    let sql = "INSERT INTO ecotracker_poke"+ server +" VALUES ('"+ req.body.action +"','"+ req.body.totalPrice +"','"+ req.body.itemName +"','"+ req.body.itemQuantity +"','"+ getFormattedDate() +"');";
        //    console.log(sql);
        //     connection.query(sql, (err2, result) =>{
        //         if (err2) throw err2;
        //         res.send();
        //
        //         console.log(result);
        //         connection.release();
        //     });
        // });
        let body = "%" + JSON.stringify(req.body) + "\n";

        fs.appendFile(logFile, body, err => {
            if (err) { console.log(err); return;}
            console.dir(body);
            res.send('Sent to server!');
        });
    });

    router.get('/api/ecotracker', async (req, res) => {
        const token = req.get('token');
        if (token == null) {
            res.status(400).send('Error: Missing Token!');
            return;
        }

        const decoded = await verifyToken(token);
        if (decoded.data.valid !== true) {
            res.status(401).end();
        }

        let server = null; // TODO
        let date = null;

        mysqlPool.getConnection((err, con) => {
           const SQL = `SELECT FROM ${server} WHERE `
        });

        // TODO Get mysql connection and return data

       res.send();
    });

    async function verifyToken(token) {
        const key = fs.readFileSync(pubPath, {encoding:'utf8'});

         let resolve = await jwt.verify(token, key,{algorithms: ['RS256']}, async (errVerify, decoded) => {
            if (errVerify) throw errVerify;
            return await decoded;
        });
         return await resolve;


    }


}

function calculateTotals() {

    let dataDir = 'src/data/';
    let archiveDir = 'src/archive/';

    getFilesToUpload()
        .then(r => {
        for (let file of r) {
            readFile(file).then(value => {
                let fileDate = file.replace("ecotracker_", "").replace(".json", "");
                let records = String(value).replace(/%/g, "").split('\n');
                let dashRecords = [];
                let verseRecords = [];
                let clubRecords = [];
                let brawlRecords = [];
                let legendsRecords = [];


                records.forEach((record, index) => {
                    if (index === records.length-1) return;
                    const parsed = JSON.parse(record);
                    const server = parsed.server;

                    switch(server) {
                        case 'verse': {
                            verseRecords.push(parsed);
                            break;
                        }
                        case 'dash': {
                            dashRecords.push(parsed);
                            break;
                        }
                        case 'legends': {
                            legendsRecords.push(parsed);
                            break;
                        }
                        case 'brawl': {
                            brawlRecords.push(parsed);
                            break;

                        }
                        case 'club': {
                            clubRecords.push(parsed);
                            break;
                        }
                    }


                    // console.log(temp.server, index, records.length);
                });

                // TODO Make this more modular
                mysqlPool.getConnection((err, conn) => {
                  if (err) throw err;

                    calculatePerServer(dashRecords).then(data => {
                        addToDB('pokedash', conn, data, fileDate);
                    });
                    calculatePerServer(verseRecords).then(data => {
                        addToDB('pokeverse', conn, data, fileDate);
                    });
                    calculatePerServer(clubRecords).then(data => {
                        addToDB('pokeclub', conn, data, fileDate);
                    });
                    calculatePerServer(legendsRecords).then(data => {
                        addToDB('pokelegends', conn, data, fileDate);
                    });
                    calculatePerServer(brawlRecords).then(data => {
                        addToDB('pokebrawl', conn, data, fileDate);
                    });
                    setTimeout(() => {
                        conn.release();
                        console.log('Released connection');

                        fs.rename(dataDir + file, archiveDir + file, (err) => {
                            if (err) throw err;
                            console.log('Moved file');
                        });

                    }, 50 * 1000)


                });
            })
                .catch(reason => {
                    console.log(reason);
                });
        }})
        .catch(reason => {
            console.log(reason);
        });

    function addToDB(server, connection, data, date) {
        const sql = `INSERT INTO ecotracker_${server} VALUES ('${date}','${JSON.stringify(data)}');`;
        connection.query(sql, (insertErr, result) => {
            if (insertErr) throw insertErr;
            return result;
        });
    }

    async function calculatePerServer(transactionArray) {
        let mostBoughtByValue = new Map();
        let mostSoldByValue = new Map();
        let mostBoughtByQuantity = new Map();
        let mostSoldByQuantity = new Map();

        for (let transaction of transactionArray) {
            if (transaction.action === 'buy') {
                if (mostBoughtByValue.get(transaction.itemName) === undefined) {
                    mostBoughtByValue.set(transaction.itemName, parseFloat(transaction.totalPrice));
                } else {
                    let temp = parseFloat(mostBoughtByValue.get(transaction.itemName)) + parseFloat(transaction.totalPrice);
                    mostBoughtByValue.set(transaction.itemName, temp);
                }

                if (mostBoughtByQuantity.get(transaction.itemName) === undefined) {
                    mostBoughtByQuantity.set(transaction.itemName, parseFloat(transaction.itemQuantity));
                } else {
                    let temp = parseInt(mostBoughtByQuantity.get(transaction.itemName)) + parseInt(transaction.itemQuantity);
                    mostBoughtByQuantity.set(transaction.itemName, temp);
                }
            } else {
                if (mostSoldByValue.get(transaction.itemName) === undefined) {
                    mostSoldByValue.set(transaction.itemName, parseFloat(transaction.totalPrice));
                } else {
                    let temp = parseFloat(mostSoldByValue.get(transaction.itemName)) + parseFloat(transaction.totalPrice);
                    mostSoldByValue.set(transaction.itemName, temp);
                }

                if (mostSoldByQuantity.get(transaction.itemName) === undefined) {
                    mostSoldByQuantity.set(transaction.itemName, parseFloat(transaction.itemQuantity));
                } else {
                    let temp = parseInt(mostSoldByQuantity.get(transaction.itemName)) + parseInt(transaction.itemQuantity);
                    mostSoldByQuantity.set(transaction.itemName, temp);
                }
            }
        }

        return [mapToObject(mostBoughtByValue), mapToObject(mostSoldByValue), mapToObject(mostBoughtByQuantity), mapToObject(mostSoldByQuantity)];
    }

    function mapToObject(m) {
        let o = {};
        for(let[k,v] of m) { o[k] = v }
        return o;
    }

    async function readFile(file) {
        let data = await fs.readFileSync(dataDir + file);
        return data;
    }
    async function getFilesToUpload() {
        let files = await getFileNames(fs.readdirSync(dataDir));
        return files;
    }
    function getFileNames(files) {
            let filesToProcess = [];
            for (let file of files) {
                let date = file.replace("ecotracker_", "").replace(".json", "");
                if (date !== getFormattedDate()) {
                    filesToProcess.push(file);
                }
            }
            return filesToProcess;
    }
}


function getFormattedDate() {
    // current date
    const date_ob = new Date();
    // adjust 0 before single digit date
    const date = ("0" + date_ob.getDate()).slice(-2);
    // current month
    const month = ("0" + (date_ob.getMonth() + 1)).slice(-2);
    // current year
    const year = date_ob.getFullYear();
    // current hours
    const hours = date_ob.getHours();
    // current minutes
    const minutes = date_ob.getMinutes();
    // current seconds
    const seconds = date_ob.getSeconds();

    return `${year}-${month}-${date}`;
}
