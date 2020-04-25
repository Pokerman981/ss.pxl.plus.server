const express = require('express');
const cors = require('cors');
const router = express.Router();
const https = require('https');
const fs = require('fs');
const app = express();
const ip = require('ip');
const jwt = require('jsonwebtoken');
const bodyparser = require('body-parser');

app.use(cors());
app.use(bodyparser);



router.get('/', (req, res) => {
    res.status(403).send();
});

router.get('/api', async (req, res) => {
    //TODO Authorize
    let paths = {routes: []};
    for (let stack of router.stack) {
        paths.routes.push(stack.route.path);
    }

    res.send(paths);
});

privatePath = './assets/private.key';

router.post('/api/login', (req, res) => {
    console.dir(req.body);
    const user = req.body.username;
    const pass = req.body.password;

    if (user === null || pass === null) {
        res.status(400).send('Unable to find required data!');
        return;
    }
    const key = fs.readFileSync(privatePath);
    const token = jwt.sign(
        {data: 'foobar'},
        key,
        {expiresIn: '1h', algorithm: 'RS256'}, (err, token) => {
            res.send({token: token});
        });
});


app.use('/', router);

keyPath = './assets/privkey.pem';
certPath = './assets/fullchain.pem';

const options = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
};

const httpsServer = https.createServer(options, app);

httpsServer.listen(420, ip.address());
console.log(`Server running at ${ip.address()}`);

