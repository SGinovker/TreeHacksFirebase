const functions = require('firebase-functions');

// The Firebase Admin SDK to access the Firebase Realtime Database.
const admin = require('firebase-admin');
admin.initializeApp();

var apikey = "hhdEY5uXfF0oMAtkWBTxzLhvl0KwlQEG";
var url = "http://www.mapquestapi.com/traffic/v2/incidents?key=" + apikey;
var upperboundx = 37.893120; 
var upperboundy = -122.800400;
var lowerboundx = 37.254705; 
var lowerboundy = -121.601074;

var intensityhash = new Map(); 
var mainhash = new Map();
var idarray = [];  


const fetch = require("node-fetch");


exports.addMessage = functions.https.onCall(async (data) => {
    let result = await routes(data);
    //console.log(result);
    // returning result.
    var list = [];
    for(let [k,v] of result) {
        list.push(v);
    }
    //console.log(jsonresult);
    return list;
});


/* Makes a request to Mapquest API
Builds an Hashtable based on crashes/road conditions that will make driving difficult. */
async function getDirection() {
    url += "&boundingBox=" + upperboundx + "," + upperboundy + "," + lowerboundx + "," + lowerboundy;
    var response = await fetch(url);
    var text = await response.json(); // read response body as text
    for (let i = 0; i < text.incidents.length; i++) {
        var latitude = text.incidents[i].lat;
        var longitude = text.incidents[i].lng;
        var thetype = text.incidents[i].type;
        var theseverity = text.incidents[i].severity;
        var id = text.incidents[i].id;
        if (mainhash.get(id) == null) {
            mainhash.set(id, new node(latitude, longitude, thetype, theseverity, id));
            // write to db
            //const snapshot = await admin.database().ref('/mainhash')
              //  .push({id: objToString(new node(latitude, longitude, thetype, theseverity, id))});
        }
        idarray.push(id); 
    }
    console.log(mainhash);
}

async function makehash() {
    // read from db
    for (let i = 0 ; i < mainhash.size; i++) {
        // read from db
        let latitude = mainhash.get(idarray[i]).lat;
        let longitude = mainhash.get(idarray[i]).lng;
        let severity = mainhash.get(idarray[i]).severity; 
        url = "http://www.mapquestapi.com/directions/v2/findlinkid?key=" + apikey + "&lat=" + latitude + "&lng=" + longitude;  
        var response = await fetch(url);
        var text = await response.json();
        let previousnumber =intensityhash.get(text.linkId);
        if (previousnumber == null && severity > 0) {
            // write to db
            intensityhash.set(text.linkId, severity);
        } else if (severity > 0) {
            // write to db
            intensityhash.set(text.linkId, previousnumber + severity); 
        }
    }    
}

/* Returns alternate routes */
async function routes(coorArray) { 
    var from = coorArray[0][0] + "," + coorArray[0][1];
    var to = coorArray[1][0] + "," + coorArray[1][1];
    var url = "http://www.mapquestapi.com/directions/v2/alternateroutes?key=" + apikey +
        "&from=" + from + "&to=" + to + "&maxroutes" + 3;  
    var response = await fetch(url);
    var text = await response.json();
    //console.log(text.route.legs[0].maneuvers);

    var rone = new Map(); 
    for (let i = 0; i < text.route.legs[0].maneuvers.length; i++) {
        let latitude = text.route.legs[0].maneuvers[i].startPoint.lat;
        let longitude = text.route.legs[0].maneuvers[i].startPoint.lng;
        let secondurl = "http://www.mapquestapi.com/directions/v2/findlinkid?key=" + apikey + "&lat=" + latitude + "&lng=" + longitude;  
        var response2 = await fetch(secondurl);
        var secondtext = await response2.json();
        //console.log(secondtext); 
        rone.set(secondtext.linkId, [latitude, longitude]); 
    }
    //console.log(routeone);
    if (text.alternateRoutes != null){
        let extraroutes = text.alternateRoutes.length;
    }
    else {
        return rone;
    }

    var rtwo = new Map(); 
    for (let i = 0; i < text.alternateRoutes[0].route.legs[0].maneuvers.length; i++) {
        let latitude = text.alternateRoutes[0].route.legs[0].maneuvers[i].startPoint.lat;
        let longitude = text.alternateRoutes[0].route.legs[0].maneuvers[i].startPoint.lng;
        let secondurl = "http://www.mapquestapi.com/directions/v2/findlinkid?key=" + apikey + "&lat=" + latitude + "&lng=" + longitude;  
        var response2 = await fetch(secondurl);
        var secondtext = await response2.json();
        //console.log(secondtext); 
        rtwo.set(secondtext.linkId, [latitude, longitude]); 
   }

   if (extraroutes == 1) return findBest(rone, rtwo, null);

   var rthree = new Map(); 
    for (let i = 0; i < text.alternateRoutes[1].route.legs[0].maneuvers.length; i++) {
        let latitude = text.alternateRoutes[1].route.legs[0].maneuvers[i].startPoint.lat;
        let longitude = text.alternateRoutes[1].route.legs[0].maneuvers[i].startPoint.lng;
        let secondurl = "http://www.mapquestapi.com/directions/v2/findlinkid?key=" + apikey + "&lat=" + latitude + "&lng=" + longitude;  
        var response2 = await fetch(secondurl);
        var secondtext = await response2.json();
        //console.log(secondtext); 
        rthree.set(secondtext.linkId, [latitude, longitude]); 
   }

   return findBest(rone, rtwo, rthree);
}

// returns best route to frontend based on severity scores of legs
async function findBest(rone, rtwo, rthree){
    // given routeone, routetwo, routethree (some may be null)
    var scoreone = 0;
    var scoretwo = -1;
    var scorethree = -1;
    for(var id in Object.keys(rone)){
        // read from db
        scoreone += intensityhash.get(id);
    }
    if(rtwo){
        for(var id in Object.keys(rtwo)){
            // read from db
            scoretwo += intensityhash.get(id);
        }
    }
    if(rthree){
        for(var id in Object.keys(rthree)){
            // read from db
            scorethree += intensityhash.get(id);
        }
    }
    // only 1 route 
    if(scoretwo == -1) return rone;
    // 2 routes
    if(scorethree == -1){
        var comp = Math.min(scoretwo, scoreone);
        if(scoreone == comp) return rone;
        return rtwo;
    }
    // 3 routes
    var comp = Math.min(scoreone, scoretwo, scorethree);
    if(scoreone == comp) return rone;
    if(scoretwo == comp) return rtwo;
    return rthree;
}

class node {
    constructor (lat, lng, type, severity, id) {
        this.lat = lat; 
        this.lng = lng; 
        this.type = type; 
        this.severity = severity;
        this.id = id; 
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function load_data(){
    var fs = require('fs');
    try {
        var data = fs.readFileSync('old_data.json', 'utf8');
        //console.log(data);
    } catch(e) {
        console.log("Error");
    }
    var object = JSON.parse(data);
    try {
    for (let i = 0; i < 100; i++) {
        let latitude = object[i].Lat;
        console.log(latitude);
        let longitude = object[i].Lng;
        let severity = object[i].Severity;
        let url = "http://www.mapquestapi.com/directions/v2/findlinkid?key=Yqy59DCuS6BCZnhCQKpKmo40yJJImB1A" 
        + "&lat=" + latitude + "&lng=" + longitude;  
        var response = await fetch(url);
        var text = await response.json();
        let previousnumber = intensityhash.get(text.linkId);
        if (previousnumber == null && severity > 0) {
            // write to db
            intensityhash.set(text.linkId, severity);
        } else if (severity > 0) {
            // write to db
            intensityhash.set(text.linkId, previousnumber + severity); 
        }
    }
    }
    catch (e){
        console.log("Done loading in max data");
    }
}

async function init() {
    await getDirection(); 
    await makehash();
    await load_data();
}

async function test() { 
    // let route = await routes([[37.422661, -122.142462], [37.337494, -122.052623]]);
    // let obj = Object.create(null);
    // for(let [k,v] of route) {
    //     obj[k] = v;
    // }
    // let result = JSON.stringify(obj);
    //let result = Object.fromEntries(routes([[37.422661, -122.142462], [37.337494, -122.052623]]));
    //console.log(result);
    //routes("Denver,CO", "Golden,CO");
}

init(); 
test(); 