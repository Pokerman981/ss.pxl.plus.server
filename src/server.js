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


registerRoutes();


app.use('/', router);



httpsServer.listen(port, domain);
console.log(`Server running at ${domain + ':' + port}`);



function registerRoutes() {
    router.all('*', (req, res, next) => {
        console.log('New Request\n', req.headers, req.body);
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

    router.get('/api/verify', (req, res) => {
        const token = req.get('token');
        if (token == null) {
            res.status(400).send('Error: Missing Token!');
            return;
        }

        res.send(verifyToken(token));
    });


    router.post('/api/ecotracker', (req, res) => {
        // let logFile = `src/data/ecotracker_${getFormattedDate()}.json`;
        // TODO Make it so the servers can only use the route
        const server = req.get('server');
        if (server === null || !availableServers.includes(server)) {
            res.status(403).end();
            return;
        }
        let arrayBody = [];
        arrayBody.push(req.body.action);
        arrayBody.push(req.body.totalPrice);
        arrayBody.push(req.body.itemName);
        arrayBody.push(req.body.itemQuantity);
        arrayBody.push(getFormattedDate());

        console.log(arrayBody);

        mysqlPool.getConnection((err, connection) => {
           if (err) throw err;
           let sql = "INSERT INTO ecotracker_poke"+ server +" VALUES ('"+ req.body.action +"','"+ req.body.totalPrice +"','"+ req.body.itemName +"','"+ req.body.itemQuantity +"','"+ getFormattedDate() +"');";
           console.log(sql);
            connection.query(sql, (err2, result) =>{
                if (err2) throw err2;
                res.send();

                console.log(result);
                connection.release();
            });
        });



        // console.log('Post EcoTracker Called');
        // let body = "%" + JSON.stringify(req.body) + "\n";
        //
        // fs.appendFile(logFile, body, err => {
        //     if (err) { console.log(err); }
        //     res.send('Sent to server!');
        // });
    });

    router.get('/api/ecotracker', (req, res) => {

       console.log('Get EcoTracker endpoint called');
       res.send();
    });

    function verifyToken(token) {
        const key = fs.readFileSync(pubPath, {encoding:'utf8'});

        jwt.verify(token, key,{algorithms: ['RS256']}, (err, decoded) => {
            if (err) return err;
            else return decoded;
        });
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
}

