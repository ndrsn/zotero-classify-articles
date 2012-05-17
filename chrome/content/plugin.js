var debug = false;

function logmsg (m) { if (debug) Services.console.logStringMessage("Zotero Classify Plugin: " + m); }
function closure (ctx, func) {
  return function () {
    func.apply(ctx, arguments);
  }
}

Zotero.Classify = {
  journals: {
    hash: {}, // for direct matches
    array: [] // for fuzzy matches
  },
  itemtype: {}, // cache to limit queries
  init: function () {
    // Set callback for when menu item is selected
    var menuitem = document.getElementById('zotero-classify-articles-menuitem');
    menuitem.addEventListener('command', closure(this, this.sync_zotero), true);
    
    // Register the callback in Zotero as an item observer
    var notifierID = Zotero.Notifier.registerObserver({ notify: closure(this, this.update_item) }, ['item']);

		// Unregister callback when the window closes (important to avoid a memory leak)
    window.addEventListener('unload', function(e) {
      Zotero.Notifier.unregisterObserver(notifierID)
    });
  },
  is_valid_type: function (item) {
    var type = this.get_type(item);
    if (type == 'journalArticle') {
      return true;
    }
  },
  update_item: function (event, type, ids, extraData) {
    if (this.journals.array.length == 0) {
      this.read_journals(
        closure(this, function () {
          this.update_item(event, type, ids, extraData) }
        )
      );
      return;
    }

    if (event == 'add' || event == 'modify') {
      var items = Zotero.Items.get(ids);
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (this.is_valid_type(item)) {
          this.classify_item(item);
        }
      }
    }
  },
  get_type: function (item) {
    var itype = this.itemtype[item.itemTypeID];
    if (!itype) { // add to cache
      itype = Zotero.ItemTypes.getName(item.itemTypeID);
      this.itemtype[item.itemTypeID] = itype;
    }
    return itype;
  },
  read_journals: function (callback) {
    var self = this;

    logmsg("Reading journals data.");

    var req = new XMLHttpRequest();
    req.open('GET', 'chrome://zotero-classify-articles/content/journals.json', false);
    req.overrideMimeType("text/plain");
    req.onreadystatechange = function (evt) {
      if (req.readyState === 4) {
        if (req.status === 0) {
          self.journals.array = JSON.parse(req.responseText);
          
          for (var i = 0; i < self.journals.array.length; i++) {
            var journal = self.journals.array[i];
            var publication = journal["Journal"].toLowerCase();
            journal["Journal"] = publication; // lowercase
            self.journals.hash[publication] = [journal["Main Discipline"], journal["Sub-discipline"]]; // copy values
          }          
          logmsg("Number of journals: " + self.journals.array.length);
          
          callback();
        } else {
          logmsg("Could not load journals data: " + req.statusText);
        }  
      }  
    };
    req.send(null);
  },
  sync_zotero: function () {
    if (this.journals.array.length == 0) { // if empty, load and call function again
      this.read_journals( closure(this, this.sync_zotero) );
      return;
    }
    var stats = {
      total: 0,
      classified: 0,
      unclassified: 0,
      nopubtitle: 0
    };

    var search = new Zotero.Search();
    search.addCondition('itemType', 'is', 'journalArticle');

    var collection_id = ZoteroPane_Local.getSelectedCollection(true);
    if (collection_id) {
      search.addCondition('collectionID', 'is', collection_id);
    }
    var item_ids = search.search();
    var items = Zotero.Items.get(item_ids);
    
    logmsg("Number of journal articles: " + items.length);
    
    stats["total"] = items.length;

    Zotero.DB.beginTransaction();
    for (var i = 0; i < items.length; i++) {      
      var item = items[i];
      var publication = item.getField('publicationTitle');
      
      if (!publication) {
        item.addTag("No publication title");
        stats["nopubtitle"]++;
        continue;
      }
      
      var success = this.classify_item(item);
      if (success) {
        stats["classified"]++;
      } else {
        stats["unclassified"]++;
      }
      if (i % 100 == 0) {
        logmsg("Item #" + i);
      }
    } 
    Zotero.DB.commitTransaction();  
 
    window.openDialog(
      "chrome://zotero-classify-articles/content/dialog.xul",
      "zotero-classify-articles-stats-dialog",
      "chrome,centerscreen", stats
    );

    logmsg("Done");
  },
  classify_item: function (item) {
    var publication = item.getField('publicationTitle').toLowerCase();
    
    var match = {};
    for (var i = 0; i < this.journals.array.length; i++) {
      var j = this.journals.array[i];
      if (publication.replace("&","and") == j["Journal"].toLowerCase()) {
        match = j;
        break;
      }
    }
    
    if ("Journal" in match) {
      logmsg("MATCH FOUND FOR " + match["Journal"]);

      var discipline = match["Main Discipline"];
      var subdiscipline = match["Sub-discipline"];
      var tag = "Discipline: " + discipline + " / " + subdiscipline;
      item.addTag(tag);

      return true;
    } else {
      logmsg("Publication not found: [" + publication + "]");
      item.addTag("Publication not found");
      return false;
    }
  },
  dialogaccept: function () { return true; }
};

window.addEventListener('load', function(e) { Zotero.Classify.init(); }, false);