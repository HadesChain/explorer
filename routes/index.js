var mongoose = require( 'mongoose' );

var Block     = mongoose.model( 'Block' );
var Transaction = mongoose.model( 'Transaction' );
var filters = require('./filters');

var async = require('async');
var https = require('https');

module.exports = function(app){
  var web3relay = require('./web3relay');

  var DAO = require('./dao');
  var Token = require('./token');

  var compile = require('./compiler');
  var fiat = require('./fiat');
  var stats = require('./stats');
  var richList = require('./richlist');

  /* 
    Local DB: data request format
    { "address": "0x1234blah", "txin": true } 
    { "tx": "0x1234blah" }
    { "block": "1234" }
  */
  // api for trust wallet
  app.get('/transactions', getTrans);

  app.post('/richlist', richList);
  app.post('/addr', getAddr);
  app.post('/addr_count', getAddrCounter);
  app.post('/tx', getTx);
  app.post('/block', getBlock);
  app.post('/data', getData);

  app.post('/daorelay', DAO);
  app.post('/tokenrelay', Token);  
  app.post('/web3relay', web3relay.data);
  app.post('/compile', compile);

  app.post('/fiat', fiat);
  app.post('/stats', stats);

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
   /*let d= '{"total":2,"docs":[{"operations":[],"contract":null,"_id":"0x4dc81415a109aacb6efa304de669c7fffe3851d3450442b8ac5a6b6e4177f049","blockNumber":6848961,"timeStamp":"1544277218","nonce":10,"from":"0x1bb89c31f8706d5b387113070c5879c1790a51f8","to":"0x351dff60f035180fe75ab7c22994c07911f4fd76","value":"2000000000000000","gas":"21000","gasPrice":"4000000000","gasUsed":"21000","input":"0x","error":"","id":"0x4dc81415a109aacb6efa304de669c7fffe3851d3450442b8ac5a6b6e4177f049","coin":99},{"operations":[],"contract":null,"_id":"0x07489d25d0f6ffc0a79e6accf1109d396b118a299bc86dbc562df0bd96695010","blockNumber":6848894,"timeStamp":"1544276281","nonce":9,"from":"0x1bb89c31f8706d5b387113070c5879c1790a51f8","to":"0x351dff60f035180fe75ab7c22994c07911f4fd76","value":"2000000000000000","gas":"60000","gasPrice":"8140000000","gasUsed":"21000","input":"0x","error":"","id":"0x07489d25d0f6ffc0a79e6accf1109d396b118a299bc86dbc562df0bd96695010","coin":99}]}';
   res.header('Content-Type','application/json; charset=utf-8');
   res.header('Content-Length', d.length);
   res.send(d);
   res.end();*/
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

}

var price = function(req,res) {
  req.body = Object.assign({"currency":"CNY","tokens":[{"symbol":"ETH"}]},req.body);
  req.body.tokens = [req.body.tokens[0]];
  console.log(req.body);
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
    var symbol = req.body.tokens[0].symbol;
    var trust= 'https://api.trustwalletapp.com/prices?currency='+req.body.currency+'&symbols='+symbol; 
    https.get(trust , (r)=>{
      r.on('data' , (d)=>{
        d = JSON.parse(d);
        d.currency = req.body.currency;
        if(d.response.length>0)
          d.response[0].contract = "0x0000000000000000000000000000000000000000";
        d = JSON.stringify(d);
        res.header('Content-Type','application/json; charset=utf-8');
        res.header('Content-Length', d.length);
        res.write(d);
        res.end(); 
      });

    }).on('error' , (e)=>{
        res.sendStatus(500);
    }).end(); 
  } 
};
var getAddr = function(req, res){
  // TODO: validate addr and tx
  var addr = req.body.addr.toLowerCase();
  var count = parseInt(req.body.count);

  var limit = parseInt(req.body.length);
  var start = parseInt(req.body.start);

  var data = { draw: parseInt(req.body.draw), recordsFiltered: count, recordsTotal: count, mined: 0 };

  var addrFind = Transaction.find( { $or: [{"to": addr}, {"from": addr}] })  

  var sortOrder = '-blockNumber';
  if (req.body.order && req.body.order[0] && req.body.order[0].column) {
    // date or blockNumber column
    if (req.body.order[0].column == 1 || req.body.order[0].column == 6) {
      if (req.body.order[0].dir == 'asc') {
        sortOrder = 'blockNumber';
      }
    }
  }

  addrFind.lean(true).sort(sortOrder).skip(start).limit(limit)
    .exec("find", function (err, docs) {
      if (docs)
        data.data = filters.filterTX(docs, addr);
      else
        data.data = [];
      res.write(JSON.stringify(data));
      res.end();
    });

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


var getAddrCounter = function(req, res) {
  var addr = req.body.addr.toLowerCase();
  var count = parseInt(req.body.count);
  var data = { recordsFiltered: count, recordsTotal: count, mined: 0 };

  async.waterfall([
  function(callback) {

  Transaction.count({ $or: [{"to": addr}, {"from": addr}] }, function(err, count) {
    if (!err && count) {
      // fix recordsTotal
      data.recordsTotal = count;
      data.recordsFiltered = count;
    }
    callback(null);
  });

  }, function(callback) {

  Block.count({ "miner": addr }, function(err, count) {
    if (!err && count) {
      data.mined = count;
    }
    callback(null);
  });

  }], function (err) {
    res.write(JSON.stringify(data));
    res.end();
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

