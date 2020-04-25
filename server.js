const express = require('express');
const cors = require('cors');
const router = express.Router();
const https = require('https');
const fs = require('fs');
const app = express();

app.use(cors());

router.get('/', (req, res) => {
	res.status(403).send();
});

app.use('/', router);

const options = {
	key: fs.readFileSync('/etc/letsencrypt/live/pxl.plus/privkey.pem'),
	cert: fs.readFileSync('/etc/letsencrypt/live/pxl.plus/fullchain.pem')
};

const httpsServer = https.createServer(options, app);

httpsServer.listen(420, "pxl.plus");
console.log('Server running at https://pxl.plus:420/');

