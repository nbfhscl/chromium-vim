var sessions   = {};
var Clipboard, History, Bookmarks, Links, Quickmarks;

Quickmarks = {};

chrome.storage.sync.get("sessions", function(s) {
  if (s.sessions === undefined) {
    chrome.storage.sync.set({sessions: {}});
  } else sessions = s.sessions;
});

Clipboard = {
  createTextArea: function() {
    var t = document.createElement("textarea");
    t.style.position = "absolute";
    t.style.left = "-100%";
    return t;
  },
  copy: function(text) {
    var t = this.createTextArea();
    t.value = text;
    document.body.appendChild(t);
    t.select();
    document.execCommand("Copy");
    document.body.removeChild(t);
  },
  paste: function(text) {
    var t = this.createTextArea();
    document.body.appendChild(t);
    t.focus();
    document.execCommand("Paste");
    text = t.value;
    document.body.removeChild(t);
    return text;
  }
};

History = {
  searchResults: null,
  append: function(value, type) {
    if (!localStorage[type] || localStorage[type] === "")
      localStorage[type] = value;
    else
      localStorage[type] += "," + value;
  },
  retrieve: function(type) {
    if (!localStorage[type]) {
      localStorage[type] = "";
    }
    return [type, localStorage[type].split(",")];
  },
  retrieveSearchHistory: function(search, limit, callback) {
    chrome.history.search({text: search, maxResults: limit}, function(results) {
      callback(results);
    });
  }
};

String.prototype.convertLink = function() {
  var url = this.trimLeft().trimRight();
  if (url.length === 0) return "chrome://newtab";
  if (/^\//.test(url)) url = "file://" + url;
  if (/^(chrome|chrome-extension|file):\/\/\S+$/.test(url)) return url;
  var pattern = new RegExp("^((https?|ftp):\\/\\/)?"+
  "((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|"+
  "((\\d{1,3}\\.){3}\\d{1,3})|"+
  "localhost)" +
  "(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*"+
  "(\\?[;&a-z\\d%_.~+=-]*)?"+
  "(\\#[-a-z\\d_]*)?$","i");
  if (pattern.test(url))
    return (/:\/\//.test(url) ? "" : "http://") + url;
  return "https://www.google.com/search?q=" + url;
};

function getTab(sender, reverse, count, first, last) {
  chrome.tabs.query({windowId: sender.tab.windowId}, function(tabs) {
    if (first) {
      return chrome.tabs.update(tabs[0].id, {active: true});
    } else if (last) {
      return chrome.tabs.update(tabs[tabs.length - 1].id, {active: true});
    } else {
      return chrome.tabs.update(tabs[((((reverse ? -count : count) + sender.tab.index) % tabs.length) + tabs.length) % tabs.length].id, {active: true});
    }
  });
}

Links = {
  multiOpen: function(links) {
    links.forEach(function(item) {
      chrome.tabs.create({url: item, active: false});
    });
  }
};

Bookmarks = {
  getMarks: function(callback) {
    chrome.bookmarks.getTree(function(tree) {
      callback(tree[0].children);
    });
  },
  containsFolder: function(path, directory) {
    directory = directory.children;
    for (var i = 0, l = directory.length; i < l; ++i) {
      if (path === directory[i].title) {
        return directory[i];
      }
    }
  },
  getFolderLinks: function(path, callback) {
    path = path.split("/").filter(function(e) { return e; });
    chrome.bookmarks.getTree(function(tree) {
      var dir = tree[0];
      while (dir = Bookmarks.containsFolder(path[0], dir)) {
        path = path.slice(1);
        if (!path || !path.length) {
          callback(dir.children.filter(function(e) {
            return e.url;
          }).map(function(e) {
            return e.url;
          }));
        }
      }
    });
  },
  getPath: function(m, p, callback, initialPath) {
    var _ret = [],
    folder = null,
    matchFound = false;
    if (!initialPath) initialPath = p.replace(/\/[^\/]+$/, "/").replace(/\/+/g, "/");
    if (typeof p !== "string" || p[0] !== "/") return false;
    p = p.split(/\//).filter(function(e) { return e; });
    m.forEach(function(item) {
      if (item.title === p[0]) {
        folder = item;
      }
      if (p[0] && item.title.substring(0, p[0].length).toLowerCase() === p[0].toLowerCase()) {
        _ret.push([item.title, (item.url || "folder"), initialPath]);
      }
      if (p.length === 0) {
        if (!matchFound) _ret = [];
        matchFound = true;
        _ret.push([item.title, (item.url || "folder"), initialPath]);
      }
    });
    if (p.length === 0 || !folder) return callback(_ret);
    p = p.slice(1);
    this.getPath(folder.children, "/" + p.join("/"), callback, initialPath);
  }
};

function requestAction(type, request, sender, callback) {
  if (isAction(request.action)) {
    callAction(request.action, {
      request : request,
      sender : sender,
      callback : callback
    });
  }
}

chrome.extension.onConnect.addListener(function(port) {
  console.assert(port.name === "main");
  port.onMessage.addListener(function(request) {
    requestAction("port", request, null, function(message) {
      port.postMessage(message);
    });
  });
});

chrome.commands.onCommand.addListener(function(command) {
  if (/^(next|previous)Tab$/.test(command)) {
    chrome.tabs.query({active: true, currentWindow: true}, function(e) {
      return getTab({tab: e[0]}, false, (command === "nextTab" ? 1 : -1), false, false);
    });
  } else if (command === "nextCompletionResult") {
    chrome.tabs.query({active: true, currentWindow: true}, function(tab) {
      chrome.tabs.sendMessage(tab[0].id, {action: "nextCompletionResult"}, function() {
        chrome.windows.create({url: "chrome://newtab"});
      });
    });
  }
});

chrome.runtime.onMessage.addListener(function(request, sender, callback) {
  requestAction("extension", request, sender, callback);
});
