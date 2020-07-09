const express = require('express');
const cors = require('cors');
const router = express.Router();
const https = require('https');
const fs = require('fs');
const app = express();
const jwt = require('jsonwebtoken');
const bodyparser = require('body-parser');
const mysql = require('mysql');
const ping = require('minecraft-server-util');
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
    'verse',
    'zone1',
    'zone2'
];
const serverIPS = [
    {hostname: 'play.pokedash.org', port: 25565},
    {hostname: 'play.pokeverse.org', port: 25565},
    {hostname: 'play.pokelegends.net', port: 25565},
    {hostname: 'play.pokeclub.net', port: 25565},
    {hostname: 'play.poke-brawl.com', port: 25565},
    {hostname: 'play.pokezone.net', port: 25565}
];

let mostrecentPing;



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


registerRoutes()
    .then(async () => {
        app.use('/', router);
        await httpsServer.listen(port, domain);
        console.log(`Server running at ${domain + ':' + port}`);

        calculateTotals();
        pingServers()
            .then(value => {
                mostrecentPing = value;
                addToDB(value);
            })
            .catch(reason => {
                throw reason;
            });
        console.log('Calculating Values');

        registerIntervals();
        console.log(`Registered Intervals`);

    })
    .catch(reason => {
        throw reason;
    });


function registerIntervals() {
    setInterval(() => {
        calculateTotals();
    }, 25000 * 1000); // Milliseconds

    setInterval(() => {
        console.log('Servers Pinged');
        pingServers()
            .then(value => {
                mostrecentPing = value;
                addToDB(value);
            })
            .catch(reason => {
                throw reason;
            });
    }, 60000); // Milliseconds

}

async function pingServers() { // TODO Have this return values instead of doing it here
    const pingResult = [];
    for (let server of serverIPS) {
        await ping(server.hostname, server.port)
            .then(value => {
                pingResult.push({
                    hostname: server.hostname ,
                    onlinePlayers: value.onlinePlayers != null ? value.onlinePlayers : 0,
                    maxPlayers: value.maxPlayers != null ? value.maxPlayers : 0
                });
            })
            .catch(reason => {
                console.log(reason);
                pingResult.push({
                    hostname: server.hostname ,
                    onlinePlayers: 0,
                    maxPlayers: 0
                });
            });
    }

    return pingResult;
}

function addToDB(data) {
     mysqlPool.getConnection(async (err, conn) => {
        if (err) throw err;

        const SQL = `INSERT INTO playercounter VALUES ('${getTimeStamp()}', '${JSON.stringify(data)}')`;
        console.log("Insert into DB");
        conn.query(SQL, (insertErr, result) => {
            if (insertErr) throw insertErr;
            console.log("Release ping conn");
            conn.release();
        });
    });
}

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

    router.get('/api/serverstatus', async (req, res) => {

    });

    router.post('/api/ecotracker', async (req, res) => {
         let logFile = `src/data/ecotracker_${getFormattedDate()}.json`;
        // TODO Make it so the servers can only use the route
        const server = req.get('server');
        if (server === null || !availableServers.includes(server)) {
            res.status(403).end();
            return;
        }

        let body = "%" + JSON.stringify(req.body) + "\n";

        fs.appendFile(logFile, body, err => {
            if (err) { console.log(err); return;}
            console.dir(body);
            res.send('Sent to server!');
        });
    });
    router.get('/api/ecotracker', async (req, res) => {
        const token = req.get('token');
        const server = req.get('server');
        const date = req.get('requestedDate');

        if (token == null) {
            res.status(400).send('Error: Missing Token!').end();
            return;
        }

        if (server == null) {
            res.status(400).send('Error: Missing Server!').end();
            return;
        }

        if (date == null) {
            res.status(400).send('Error: Missing Date!').end();
            return;
        }


        await verifyToken(token)
            .then(value => {
                mysqlPool.getConnection(async (err, con) => {
                    if (err) throw err;
                    console.log('Connected To DB');
                    const SQL = `SELECT date, data FROM ecotracker_poke${server} WHERE date BETWEEN '${date}' AND '${getFormattedDate()}';`;

                    // Can make this an await
                    con.query(SQL, (err, result) => {
                        if (err) throw err;

                        con.release();
                        console.log('Connection Released', server, date, token);
                        res.send(result);
                    });
                });
            })
            .catch(reason => {
                console.log(reason);
                // TODO Add a response
            });



    });

    router.get('/api/playercounter', async (req, res) => {
        const token = req.get('token');
        const lowerDate = req.get('lowerDate');
        const higherDate = req.get('higherDate');

        if (token == null) {
            res.status(400).send('Error: Missing Token!').end();
            return;
        }

        if (lowerDate == null) {
            res.status(400).send('Error: Missing Lower Date!').end();
            return;
        }

        if (higherDate == null) {
            res.status(400).send('Error: Missing Higher Date!').end();
            return;
        }

        await verifyToken(token)
            .then(async (value) => {
                const SQL = `SELECT date, data FROM playercounter WHERE date BETWEEN '${lowerDate}' AND '${higherDate}';`;
                await mysqlPool.getConnection((err, conn) => {
                    if (err) throw err;
                    conn.query(SQL, (err2, result) => {
                        if (err2) throw err2;
                        res.send(result);
                        conn.release();
                    });
                });
            })
            .catch(reason => {
                res.status(400).send(reason);
            })

    });



    async function verifyToken(token) { // TODO Make it so when the method finds a invalid token it cancels the request
        const key = fs.readFileSync(pubPath, {encoding:'utf8'});

         let resolve = await jwt.verify(token, key,{algorithms: ['RS256']}, async (errVerify, decoded) => {
            if (errVerify) return await errVerify;
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
                let zone1Records = [];
                let zone2Records = [];


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
                        case 'zone1': {
                            zone1Records.push(parsed);
                            break;
                        }
                        case 'zone2': {
                            zone2Records.push(parsed);
                            break;
                        }
                    }


                    // console.log(temp.server, index, records.length);
                });
                // TODO Make this more modular
                mysqlPool.getConnection((err, conn) => {
                  if (err) throw err;

                  console.log('connected');
                    calculatePerServer(dashRecords).then(data => {
                        addToDB('dash', conn, data, fileDate);
                    });
                    calculatePerServer(verseRecords).then(data => {
                        addToDB('verse', conn, data, fileDate);
                    });
                    calculatePerServer(clubRecords).then(data => {
                        addToDB('club', conn, data, fileDate);
                    });
                    calculatePerServer(legendsRecords).then(data => {
                        addToDB('legends', conn, data, fileDate);
                    });
                    calculatePerServer(brawlRecords).then(data => {
                        addToDB('brawl', conn, data, fileDate);
                    });
                    calculatePerServer(zone1Records).then(data => {
                        addToDB('zone1', conn, data, fileDate);
                    });
                    calculatePerServer(zone2Records).then(data => {
                        addToDB('zone2', conn, data, fileDate);
                    });


                    setTimeout(() => {
                        conn.release();
                        console.log('Released connection');

                        fs.rename(dataDir + file, archiveDir + file, (err) => {
                            if (err) throw err;
                            console.log('Moved file');
                            control = false;
                        }, 25 * 1000);
                    })
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
        const sql = `INSERT INTO ecotracker_poke${server} VALUES ('${date}','${JSON.stringify(data)}');`;
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
        let mostBoughtByPlayer = new Map();
        let mostSoldByPlayer = new Map();
        let totalsInDay = new Map();

        for (let transaction of transactionArray) {
            const action = transaction.action,
             itemName = transaction.itemName,
             totalPrice = transaction.totalPrice,
             itemQuantity = transaction.itemQuantity,
             targetName = transaction.targetName;

            if (action === 'buy') {
                if (mostBoughtByValue.get(itemName) === undefined) {
                    mostBoughtByValue.set(itemName, parseFloat(totalPrice));
                } else {
                    let temp = parseFloat(mostBoughtByValue.get(itemName)) + parseFloat(totalPrice);
                    mostBoughtByValue.set(itemName, parseFloat(temp));
                }

                if (mostBoughtByQuantity.get(itemName) === undefined) {
                    mostBoughtByQuantity.set(itemName, parseFloat(itemQuantity));
                } else {
                    let temp = parseInt(mostBoughtByQuantity.get(itemName)) + parseInt(itemQuantity);
                    mostBoughtByQuantity.set(itemName, parseFloat(temp));
                }

                if (mostBoughtByPlayer.get(targetName) === undefined) {
                    mostBoughtByPlayer.set(targetName, parseFloat(itemQuantity));
                } else {
                    let temp = parseFloat(mostBoughtByPlayer.get(targetName)) + parseFloat(totalPrice);
                    mostBoughtByPlayer.set(targetName, parseFloat(temp));
                }

                if (totalsInDay.get("bought") === undefined) {
                    totalsInDay.set("bought", parseFloat(totalPrice));
                } else {
                    let temp = parseFloat(totalsInDay.get("bought")) + parseFloat(totalPrice);
                    totalsInDay.set("bought", parseFloat(temp));
                }

            } else {
                if (mostSoldByValue.get(itemName) === undefined) {
                    mostSoldByValue.set(itemName, parseFloat(totalPrice));
                } else {
                    let temp = parseFloat(mostSoldByValue.get(itemName)) + parseFloat(totalPrice);
                    mostSoldByValue.set(itemName, temp);
                }

                if (mostSoldByQuantity.get(itemName) === undefined) {
                    mostSoldByQuantity.set(itemName, parseFloat(itemQuantity));
                } else {
                    let temp = parseInt(mostSoldByQuantity.get(itemName)) + parseInt(itemQuantity);
                    mostSoldByQuantity.set(itemName, temp);
                }

                if (mostSoldByPlayer.get(targetName) === undefined) {
                    mostSoldByPlayer.set(targetName, parseFloat(itemQuantity));
                } else {
                    let temp = parseFloat(mostSoldByPlayer.get(targetName)) + parseFloat(totalPrice);
                    mostSoldByPlayer.set(targetName, parseFloat(temp));
                }

                if (totalsInDay.get("sold") === undefined) {
                    totalsInDay.set("sold", parseFloat(totalPrice));
                } else {
                    let temp = parseFloat(totalsInDay.get("sold")) + parseFloat(totalPrice);
                    totalsInDay.set("sold", parseFloat(temp));
                }
            }
        }

        return [{totals:mapToObject(totalsInDay)}, {mostBoughtByValue:mapToObject(mostBoughtByValue)}, {mostSoldByValue: mapToObject(mostSoldByValue)}, {mostBoughtByQuantity: mapToObject(mostBoughtByQuantity)}, {mostSoldByQuantity: mapToObject(mostSoldByQuantity)}, {mostBoughtByPlayer: mapToObject(mostBoughtByPlayer)}, {mostSoldByPlayer: mapToObject(mostSoldByPlayer)}];
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

function getTimeStamp() {
    let date = new Date();
    date =  date.getUTCFullYear() + '-' +
        ('00' + (date.getUTCMonth()+1)).slice(-2) + '-' +
        ('00' + date.getUTCDate()).slice(-2) + ' ' +
        ('00' + date.getUTCHours()).slice(-2) + ':' +
        ('00' + date.getUTCMinutes()).slice(-2) + ':' +
        ('00' + date.getUTCSeconds()).slice(-2);
    return date
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
