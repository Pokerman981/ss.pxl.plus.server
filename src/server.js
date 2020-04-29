const express = require('express');
const cors = require('cors');
const router = express.Router();
const https = require('https');
const fs = require('fs');
const app = express();
const jwt = require('jsonwebtoken');
const bodyparser = require('body-parser');
const mysql = require('mysql');

app.use(cors());
app.use(bodyparser.json());


registerRoutes();


app.use('/', router);

keyPath = '/etc/letsencrypt/live/ss.pxl.plus/privkey.pem';
certPath = '/etc/letsencrypt/live/ss.pxl.plus/fullchain.pem';
domain = 'ss.pxl.plus';
port = 420;

const options = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
};

const con = mysql.createConnection({
    host: 'localhost',
    user:'ss.pxl.plus.server',
    password: 'Gy9jG208omZ24H7M',
    database: 'ss.pxl.plus.server'
});

const privatePath = 'assets/jwtRS512.key';
const pubPath = 'assets/jwtRS512.key.pub';

const httpsServer = https.createServer(options, app);

httpsServer.listen(port, domain);
console.log(`Server running at ${domain + port}`);

con.connect(err => {
    if (err) throw err;
    console.log('Connected To The DB');
});




function registerRoutes() {
    router.all('*', (req, res, next) => {
        console.log('New Request', req.headers, req.body);
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

        let sql = `SELECT * from users where username=? OR email=? AND password=?;`;
        con.query(sql, [user, user, pass], (err, result) => {
            if (err) throw err;
            if (result.length === 1) {
                const key = fs.readFileSync(privatePath, {encoding:'utf8'});
                jwt.sign({data:{username: result[0].username, id: result[0]['user_id'], valid: true}}, key, {expiresIn: '1h', algorithm: 'RS256'},
                    (err, token) => {
                        res.send({token: token});
                    });
            } else {
                res.status(401).send('Username or Password is incorrect');
            }
        });




    });

    router.get('/api/verify', (req, res) => {
        const token = req.get('token');
        if (token == null) {
            res.status(400).send('Error: Missing Token!');
            return;
        }
        const key = fs.readFileSync(pubPath, {encoding:'utf8'});

        jwt.verify(token, key,{algorithms: ['RS256']}, (err, decoded) => {
            console.log(err, decoded);
            res.send(decoded);
        });





    });


}

