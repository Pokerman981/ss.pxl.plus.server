const express = require('express');
const cors = require('cors');
const router = express.Router();
const https = require('https');
const fs = require('fs');
const app = express();
const ip = require('ip');

app.use(cors());


router.get('/', (req, res) => {
	res.status(403).send();
});

router.get('/api/', (req, res) => {
	//TODO Authorize
	res.send(router.stack);
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

