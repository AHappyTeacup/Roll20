/**
* Generic function to sanitize characters for html.
*
* @author The Aaron
* @param {String} c, A single chagracter.
* @return {String} A html friendly character equivalent.
*/
ch = function (c) {
  var entities = {
    '<' : 'lt',
    '>' : 'gt',
    "'" : '#39',
    '@' : '#64',
    '{' : '#123',
    '|' : '#124',
    '}' : '#125',
    '[' : '#91',
    ']' : '#93',
    '"' : 'quot',
    '-' : 'mdash',
    ' ' : 'nbsp'
  };
  if(_.has(entities,c) ){
    return ('&'+entities[c]+';');
  }
  return '';
}

/**
* Generic function to send a chat message to Roll20.
*
* @author The Aaron
* @param {String} message The text to send.
* @param {String} who The player name.
* @param {Boolean} whisper Whether or not to whisper the message.
* @return {None}
*/
sendMessage = function(message, who, whisper) {
  let text = `${(whisper||'gm'===who)?`/w ${who} `:''}
  <div style="padding:1px 3px;border: 1px solid #8B4513;
  background: #eeffee; color: #8B4513; font-size: 80%;">${message}
  </div>`;
  text = text.replace(/(\r\n|\n\r|\n|\r)/gm, '');
  sendChat('Ammo', text);
}


/**
* Generic function to handle input.
*
* @author The Aaron
* @param {String} msg_orig The JSON string picked up by js.
* @return {Object}
*/
processInputMessages = function (msg_orig) {
  let msg = _.clone(msg_orig);
  if(_.has(msg,'inlinerolls')){
    msg.content = _.chain(msg.inlinerolls).reduce(
      function(m,v,k){m['$[['+k+']]']=v.results.total || 0; return m;}, {}
    ).reduce(function(m,v,k){return m.replace(k,v);}, msg.content).value();
  }
  let who = (getObj('player',msg.playerid)||{get:()=>'API'}).get('_displayname');
  let raw_args = msg.content.split(/\s+/);
  let msg_args = raw_args.filter((a)=>!/^--/.test(a));
  let switches = raw_args.filter((a)=>/^--/.test(a));
  let r_val = [who, msg_args, switches];
  return r_val;
}


/**
* Get the character Object, and token Object for a given character ID.
*
* @author The Aaron
* @param {String} character_id
* @param {String} player_id
* @param {Object} who
* @param {Boolean} whisper
* @returns {Object, Object}
*/
get_char_and_token = function(character_id, player_id, who, whisper) {
  let char = getObj('character', character_id);
  let token = getObj('graphic', character_id);
  if (! char) {
    if(token) {char = getObj('character', token.get('represents'));}
  }
  if (char) {
    if (! playerIsGM(player_id) &&
    ! _.contains(char.get('controlledby').split(','), player_id) &&
    ! _.contains(char.get('controlledby').split(','),'all')
    ) {
      sendMessage(
        `You do not control the specified character: ${char.id}`,
        (playerIsGM(player_id) ? 'gm' : who),
        whisper
      );
      sendMessage(
        `<b>${getObj('player', player_id).get('_displayname')}</b>`+
        `attempted to make changes to character <b>${char.get('name')}</b>.`,
        'gm',
        whisper
      );
      var e = new Error();
      e.type = "Permissions Error";
      e.char = char;
      throw e;
    }
  } else {
    sendMessage(
      (
        token ?
        `Token id [${character_id}] does not represent a character. ` :
        `Character/Token id [${character_id}] is not valid. `
      ) +
      `Please be sure you are specifying it correctly, either with `+
      `${ch('@')}${ch('{')}selected|token_id${ch('}')} `+
      `or ${ch('@')}${ch('{')}selected|character_id${ch('}')}.`,
      (playerIsGM(player_id) ? 'gm' : who),
      whisper
    );
  }
  let r_val = [char, token]
  return r_val;
}


/**
* Look up attributes.
* Some additional logic is present here for a subset of specific IDs.
*
* @author The Aaron
* @param {String} character The character we are getting an attribute for.
* @param {String} name The name of the attribute we are getting.
* @param {Boolean} caseSensitive
* @returns {Object} The attribute Object.
*/
attrLookup = function(character, name, caseSensitive) {
  let match = name.match(/^(repeating_.*)_\$(\d+)_.*$/);
  if(match){
    let index = match[2],
    attrMatcher = new RegExp(
      `^${name.replace(/_\$\d+_/,'_([-\\da-zA-Z]+)_')}$`,
      (caseSensitive?'i': '')
    ),
    createOrderKeys = [];

    let attrs = findObjs({type:'attribute', characterid:character.id});
    let filtered_attrs = _.chain(attrs)
    .map((a)=>{return {attr:a, match:a.get('name').match(attrMatcher)};})
    .filter((o)=>o.match)
    .each((o)=>createOrderKeys.push(o.match[1]))
    .reduce((m,o)=>{m[o.match[1]]=o.attr; return m;}, {})
    .value();
    log(`attrs: ${attrs}`);
    log(`filtered_attrs: ${filtered_attrs}`);

    let a = findObjs({type:'attribute', characterid:character.id, name:`_reporder_${match[1]}`});
    let something = ((a[0] || {get:_.noop}).get('current') || '').split(/\s*,\s*/);
    let sortOrderKeys = _.chain(something)
    .intersection(createOrderKeys)
    .union(createOrderKeys)
    .value();
    log(`a: ${a}`);
    log(`something: ${something}`);
    log(`sortOrderKeys: ${sortOrderKeys}`);
    if(index<sortOrderKeys.length && _.has(attrs, sortOrderKeys[index])){
      return attrs[sortOrderKeys[index]];
    }
    return;
  }
  const attr = findObjs(
    {type:'attribute', characterid:character.id, name: name},
    {caseInsensitive: !caseSensitive}
  )[0];
  log(`attrLookup for "${character.id}|${name}" found: ${attr}`);
  return attr;
}


/**
* Get a list of item _name objects for m.
*
* @author https://gist.github.com/oukag
* @param {String} character_id
* @param {String} item_name
* @returns {String} The identifying 'rowid' string for an item.
*/
get_character_item_rowids_by_name = function(character_id, item_name) {
  var item_rowid_regex = new RegExp('repeating_item_(.+?)(?:_name)');
  let items = filterObjs(
    function(obj){
      if (
        obj.get('type') === 'attribute'
        && obj.get('characterid') === character_id
        && item_rowid_regex.exec(obj.get('name'))
        && obj.get('current') === item_name
      ) {return obj;}
    }
  )
  let item_ids = items.map((obj)=>{return item_rowid_regex.exec(obj.get('name'))[1]});
  return item_ids;
}


/**
* Get the identifying 'rowid' string for an item.
*
* @author https://gist.github.com/oukag
* @param {String} character_id
* @param {String} item_name
* @returns {String} The identifying 'rowid' string for an item.
*/
get_character_item_rowid_by_name = function(character_id, item_name) {
  let inventory = get_character_item_rowids_by_name(character_id, item_name);
  if (!inventory) {
    // TODO: Log an error.
    log(`No '${item_name}'s found.`)
    return '';
  } else if (inventory.length > 1) {
    // TODO: Log an error.
    log(`Too many '${item_name}'s found.`)
    return '';
  }
  return item_rowid_regex.exec(inventory[0].name)[1];
}


/**
* @author https://gist.github.com/oukag
* @returns {Object} The "repeating_item_<row_id>_uses" object.
*/
get_item_usage = function(character_id, row_id) {
  log(`get_item_usage > character_id > ${character_id}`);
  log(`get_item_usage > row_id > ${row_id}`);
  var item_usage_obj = findObjs(
    {
      _type: 'attribute',
      characterid: character_id,
      name: `repeating_item_${row_id}_uses`
    }
  )[0];
  return item_usage_obj;
}


/**
* Adjust the uses of an item.
* @author https://gist.github.com/oukag
* @param {String} character_id
* @param {String} rowid
* @param {int} new_amount
* @returns {None}
*/
adjust_item_usage = function (character_id, rowid, adjustment) {
  log(`adjust_item_usage > rowid > ${rowid}`);
  var existing = findObjs(
    {
      _type: 'attribute',
      characterid: character_id,
      name: `repeating_item_${rowid}_uses`
    }
  )[0];
  log(`adjust_item_usage > existing > ${existing}`);
  const existing_val_current = parseInt(existing.get('current'), 10);
  let new_amount = existing_val_current + adjustment;
  // TODO: Prevent from reducing below zero / adjusting above max.
  existing.setWithWorker({'current': new_amount});
}


/**
* Adjust the quantity of an item.
* @author https://gist.github.com/oukag
* @param {String} character_id
* @param {String} rowid
* @param {int} new_amount
* @returns {None}
*/
adjust_item_quantity = function (character_id, rowid, adjustment) {
  log(`adjust_item_quantity > rowid > ${rowid}`);
  var existing = findObjs(
    {
      _type: 'attribute',
      characterid: character_id,
      name: `repeating_item_${rowid}_quantity`
    }
  )[0];
  log(`adjust_item_quantity > existing > ${existing}`);
  const existing_val_current = parseInt(existing.get('current'), 10);
  let new_amount = existing_val_current + adjustment;
  // TODO: Prevent from reducing below zero / adjusting above max.
  existing.setWithWorker({'current': new_amount});
}
