var mongoose = require( 'mongoose' );

var Block     = mongoose.model( 'Block' );
var Transaction = mongoose.model( 'Transaction' );
var Event = mongoose.model( 'Event' );
var filters = require('./filters');

var async = require('async');
var https = require('https');

module.exports = function(app){
  var web3relay = require('./web3relay');

  // api for trust wallet
  app.get('/transactions', getTrans);
  app.post('/events', getEvents);
  app.post('/tx', getTx);
  app.post('/block', getBlock);

  app.post('/data', getData);
  app.post('/web3relay', web3relay.data);

  app.post('/tokenPrices',price);

  // todo
  app.post('/tokens',(req,res)=>{
    res.send('{"docs":[]}');
    res.end();
    
  });
  app.post('/prices',(req,res)=>{
    res.send('{"status":true,"docs":[{"price":"0.0312211978","percent_change_24h":"-9.74","contract":"0x000000000000000000000000000000000000003c"},{"price":"110.1959","percent_change_24h":"-2.74","contract":"0x000000000000000000000000000000000000003d"},{"price":"1","percent_change_24h":"0","contract":"0x0000000000000000000000000000000000000063"}]}')
    res.end();
    
  });

 // alt trans
 app.get('/hdc/transactions' , (req , res)=>{
   getTrans(req , res);  
 });
 app.get('/ethereum/transactions' , (req , res)=>{
    req.query = Object.assign({page:1,startBlock:1},req.query);
    var trust = 'https://public.trustwalletapp.com';
    trust += '/ethereum/transactions?address='+req.query.address+'&page='+req.query.page+'&startBlock='+req.query.startBlock;
    https.get(trust , (r)=>{

      let d = '';
      r.on('data' , (chunk)=>{
        d = d + String.fromCharCode.apply(null, chunk);
      }).on('end' , ()=>{
        res.header('Content-Type','application/json; charset=utf-8');
        res.header('Content-Length', d.length);
        res.send(d);
        res.end();

      });

    }).on('error' , (e)=>{
        res.sendStatus(500);
    }).end();


 });

 app.options('/events',(req,res)=>{
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
  res.header('Access-Control-Allow-Headers', 'Origin,x-requested-with,Content-Type');  
  res.sendStatus(202);
 });

}

var price = function(req,res) {
console.log(req.body);
  req.body = Object.assign({"currency":"CNY","tokens":[{"symbol":"ETH"}]},req.body);
  req.body.tokens = [req.body.tokens[0]];

  var hdc = {
    "status": true,
    "response": [
        {
            "id": "hadescoin",
            "name": "HadesCoin",
            "price": "1.00",
            "image": "",
            "symbol": "HDC",
            "contract": "0x0000000000000000000000000000000000000000",
            //"percent_change_24h": "-8.55"
        }
    ],
    "currency": "CNY"
  }; 
  if(req.body.tokens[0].symbol=='HDC') {
    res.send(JSON.stringify(hdc));
    res.end();
  } else {
    //var symbol = req.body.tokens[0].symbol;
    var trust= 'https://api.trustwallet.com/tickers?coin_id=60&currency=CNY'; 
    https.get(trust , (r)=>{
      r.on('data' , (d)=>{

        d = JSON.parse(d);
        d.response = d.docs;
        delete d.docs;
        d.response[0].contract = "0x0000000000000000000000000000000000000000";
        res.send(JSON.stringify(d));
        res.end();

      });

    }).on('error' , (e)=>{
        res.sendStatus(500);
    }).end(); 
  } 
};

var getTrans = function(req, res){
  req.query = Object.assign({limit:10 , page:1} , req.query);
  req.query.page = parseInt(req.query.page) ? parseInt(req.query.page) : 1;
  req.query.limit = parseInt(req.query.limit) ? parseInt(req.query.limit) : 10;

  var addr = req.query.address.toLowerCase();
  var limit = req.query.limit;
  var start = (req.query.page-1) * limit;
  
  var data = {limit:limit , page:req.query.page};
  var cond = { $or: [{"to": addr}, {"from": addr}] };
  
  Transaction.count(cond).then((total)=>{
     data.total = total;
     data.pages = Math.ceil(total/limit);
     if(total > 0)  {
        return Transaction.find(cond).lean(true).sort('-blockNumber').skip(start).limit(limit).exec("find");
     } else {
       return Promise.resolve([]);
     }
  }).then((docs)=>{
     data.docs = filters.filterTrans(docs, addr); 
     res.write(JSON.stringify(data));
     res.end();
  }).catch((e)=>{
     res.sendStatus(500);
  });

};

var getEvents = function(req, res){
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');

  var cond = {};
  var data = {};

  if (req.body.address && req.body.address.length==42) cond.address = req.body.address;
  if (req.body['topics.0']) cond['topics.0'] = req.body['topics.0'];
  if (req.body['topics.1']) cond['topics.1'] = req.body['topics.1'];

  if (Object.keys(cond).length==0) {
    res.sendStatus(404);
    return;
  }
  
  req.body = Object.assign({limit:10 , page:1} , req.body);
  data.page = parseInt(req.body.page) ? parseInt(req.body.page) : 1;
  data.limit = parseInt(req.body.limit) ? parseInt(req.body.limit) : 10;

  var start = (data.page-1) * data.limit;
  Event.count(cond).then((total)=>{
     data.total = total;
     data.pages = Math.ceil(total/data.limit);
     if(total > 0)  {
        return Event.find(cond).lean(true).sort('-_id').skip(start).limit(data.limit).exec("find");
     } else {
       return Promise.resolve([]);
     }
  }).then((docs)=>{
     data.docs = docs;
     res.write(JSON.stringify(data));
     res.end();
  }).catch((e)=>{
     res.sendStatus(500);
  });

};

var getBlock = function(req, res) {
  // TODO: support queries for block hash
  var txQuery = "number";
  var number = parseInt(req.body.block);

  var blockFind = Block.findOne( { number : number }).lean(true);
  blockFind.exec(function (err, doc) {
    if (err || !doc) {
      console.error("BlockFind error: " + err)
      console.error(req.body);
      res.write(JSON.stringify({"error": true}));
    } else {
      var block = filters.filterBlocks([doc]);
      res.write(JSON.stringify(block[0]));
    }
    res.end();
  });
};


var getTx = function(req, res){
  var tx = req.body.tx.toLowerCase();
  var txFind = Transaction.findOne( { "hash" : tx })
                  .lean(true);
  txFind.exec(function (err, doc) {
    if (!doc){
      console.log("missing: " +tx)
      res.write(JSON.stringify({}));
      res.end();
    } else {
      // filter transactions
      //var txDocs = filters.filterBlock(doc, "hash", tx)
      res.write(JSON.stringify(filters.filterTx(doc)));
      res.end();
    }
  });
};
/*
  Fetch data from DB
*/
var getData = function(req, res){
  // TODO: error handling for invalid calls
  var action = req.body.action.toLowerCase();
  var limit = req.body.limit

  if (action in DATA_ACTIONS) {
    if (isNaN(limit))
      var lim = MAX_ENTRIES;
    else
      var lim = parseInt(limit);  
    DATA_ACTIONS[action](lim, res);
  } else { 
    console.error("Invalid Request: " + action)
    res.status(400).send();
  }
};

/* 
  temporary blockstats here
*/
var latestBlock = function(req, res) {
  var block = Block.findOne({}, "totalDifficulty")
                      .lean(true).sort('-number');
  block.exec(function (err, doc) {
    res.write(JSON.stringify(doc));
    res.end();
  });
} 


var getLatest = function(lim, res, callback) {
  var blockFind = Block.find({}, "number transactions timestamp miner extraData")
                      .lean(true).sort('-number').limit(lim);
  blockFind.exec(function (err, docs) {
    callback(docs, res);
  });
}

/* get blocks from db */
var sendBlocks = function(lim, res) {
  var blockFind = Block.find({}, "number timestamp miner extraData")
                      .lean(true).sort('-number').limit(lim);
  blockFind.exec(function (err, docs) {
    if(!err && docs) {
      var blockNumber = docs[docs.length - 1].number;
      // aggregate transaction counters
      Transaction.aggregate([
        {$match: { blockNumber: { $gte: blockNumber } }},
        {$group: { _id: '$blockNumber', count: { $sum: 1 } }}
      ]).exec(function(err, results) {
        var txns = {};
        if (!err && results) {
          // set transaction counters
          results.forEach(function(txn) {
            txns[txn._id] = txn.count;
          });
          docs.forEach(function(doc) {
            doc.txn = txns[doc.number] || 0;
          });
        }
        res.write(JSON.stringify({"blocks": filters.filterBlocks(docs)}));
        res.end();
      });
    } else {
      console.log("blockFind error:" + err);
      res.write(JSON.stringify({"error": true}));
      res.end();
    }
  });
}

var sendTxs = function(lim, res) {
  Transaction.find({}).lean(true).sort('-blockNumber').limit(lim)
        .exec(function (err, txs) {
          res.write(JSON.stringify({"txs": txs}));
          res.end();
        });
}

const MAX_ENTRIES = 10;

const DATA_ACTIONS = {
  "latest_blocks": sendBlocks,
  "latest_txs": sendTxs
}

