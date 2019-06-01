var request = require("request");
var j2x = require("jsontoxml");
var moment = require("moment");
var fs = require("fs-extra");
var paste = require("better-pastebin");

var config = fs.readJSONSync("config.json");
paste.setDevKey(config.pastebin.apikey)

var plutoxml = {
	grabJSON: function(callback){
		callback = callback || function(){};
		
		console.log("[INFO] Grabbing EPG...");
		
		// check for cache
		if(fs.existsSync("cache.json")){
			var stat = fs.statSync("cache.json");
			
			var now = new Date() / 1000;
			var mtime = new Date(stat.mtime) / 1000;
			
			// it's under 30 mins old
			if(now - mtime <= 1800){
				console.log("[DEBUG] Using cache.json, it's under 30 minutes old.");
				
				callback(false, fs.readJSONSync("cache.json"));
				return
			}
		}	
		
		// 2019-05-20 00:00:00.000-0500
		var url = "http://api.pluto.tv/v2/channels"+
		"?start="+moment().format("YYYY-MM-DD HH:00:00 ZZ")+
		"&stop="+moment().add(8, "hours").format("YYYY-MM-DD HH:00:00 ZZ")+
		"&deviceId=thisisatest"+
		"&deviceMake=PlutoXML"+
		"&deviceVersion="+config.version+
		"&deviceType=web"+
		"&deviceDNT=1"+
		"&sid=thisisatest"+
		"&appName=PlutoXML"+
		"&appVersion="+config.version;
		
		console.log(url);
		
		request(url, function(err, code, raw){
			console.log("[DEBUG] Using api.pluto.tv, writing cache.json.");
			fs.writeFileSync("cache.json", raw);
			
			callback(err || false, JSON.parse(raw));
			return;
		});
	}
}

module.exports = plutoxml;

paste.login(config.pastebin.user, config.pastebin.pass, function(success, data) {
	plutoxml.grabJSON(function(err, json){
		/////////////////////////
		// XMLTV Program Guide //
		/////////////////////////
		var tv = [];
		
		//////////////
		// Channels //
		//////////////
		
		for(var i = 0; i < json.length; i++){
			var channel = json[i];
			
			tv.push({
				name: "channel", 
				attrs: {id: channel.slug}, 
				children: [
					{name: "display-name", text: channel.name},
					{name: "display-name", text: channel.number},
					{name: "desc", text: channel.summary},
					{name: "icon", attrs: {src: channel.logo.path}}
				]
			});
			
			//////////////
			// Episodes //
			//////////////
			
			for(var i2 = 0; i2 < channel.timelines.length; i2++){
				var program = channel.timelines[i2];
				
				console.log("[INFO] Adding instance of "+program.title+" to channel "+channel.name+".");
				if(!program.episode){console.log(program);}
				
				tv.push({
					name: "programme", 
					attrs: {
						start: moment(program.start).format("YYYYMMDDHHmmss ZZ"),
						stop:  moment(program.stop).format("YYYYMMDDHHmmss ZZ"),
						channel:  channel.slug
					}, 
					children: [
						{name: "title", attrs: {lang: "en"}, text: program.title},
						{name: "sub-title", attrs: {lang: "en"}, text: (program.title == program.episode.name ? "" : program.episode.name)},
						{name: "desc", attrs: {lang: "en"}, text: program.episode.description},
						{name: "date", text: moment(program.episode.firstAired).format("YYYYMMDD")},
						{name: "category", attrs: {lang: "en"}, text: program.episode.genre},
						{name: "category", attrs: {lang: "en"}, text: program.episode.subGenre},
						{name: "episode-num", attrs: {system: "onscreen"}, text: program.episode.number},
					]
				});
			}
		}
		
		var epg = j2x({
			tv: tv
		}, {
			prettyPrint: true,
			escape: true
		});
		
		fs.writeFileSync("epg.xml", epg)
		console.log("[SUCCESS] Wrote the EPG to epg.xml!"); 
		
		////////////////
		// M3U8 Tuner //
		////////////////
		
		var m3u8 = "";
		
		for(var i = 0; i < json.length; i++){
			var channel = json[i];
			
			if(channel.isStitched){
				m3u8 = m3u8 + '#EXTINF:0, channel-id="'+channel.slug+'" tvg-logo="'+channel.logo.path+'" group-title="'+channel.category+'",'+channel.name+'\n'
				m3u8 = m3u8 + channel.stitched.urls[0].url + "\n\n";
				
				console.log("[INFO] Adding "+channel.name+" channel.")
			}else{
				console.log("[DEBUG] Skipping 'fake' channel "+channel.name+".");
			}
		}
		
		fs.writeFileSync("tuner.m3u8", m3u8)
		console.log("[SUCCESS] Wrote the M3U8 tuner to tuner.m3u8!"); 
		
		//////////////////////////
		// Pastebin Integration //
		//////////////////////////
		
		// update the EPG.
		paste.edit(config.pastebin.epg, epg, function(success) {
			if(!success){
				console.log("[ERROR] Couldn't update the EPG on pastebin!"); 
				process.exit();
			}
			
			console.log("[SUCCESS] Updated the EPG on pastebin!"); 
			
			// update the m3u8 tuner.
			paste.edit(config.pastebin.m3u8, m3u8, function(success) {
				if(!success){
					console.log("[ERROR] Couldn't update the M3U8 tuner on pastebin!"); 
					process.exit();
				}
				
				console.log("[SUCCESS] Updated the M3U8 tuner on pastebin!"); 
				console.log("[SUCCESS] All done!");
			});
		});
	})
})














