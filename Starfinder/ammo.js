// TODO: A lot of descriptions and functions need updating as my design is no
// longer in line with The Aaron's design.
// TODO: Question for users: ammo_name was intended to create messages like "uses 1 round", "uses 1 charge", rather than the name of the ammo item.
// Should we hardcode on the API side what the ammo item name is, or let the users set it in the reload button?


/**
* Function to display Ammo API help.
*
* @author The Aaron
* @param who
* @param playerid
* @return {None} Send the help text to the Roll20 chat.
*/
showHelp = function(who, playerid) {
  let helptext = `/w "${who}"
<div style="border: 1px solid black; background-color: white; padding: 3px 3px;">
  <div style="font-weight: bold; border-bottom: 1px solid black;font-size: 130%;">
    Ammo API
  </div>
  <div style="padding-left:10px;margin-bottom:3px;">
    <p>
      Ammo provides inventory management for ammunition stored in a character attribute.
      If the adjustment would change the attribute to be below 0 or above
      it${ch("'")}s maximum value, a warning will be issued and the attribute will not be changed.
    </p>
  </div>
  <b>Commands</b>
  <div style="padding-left:10px;">
    <b>
      <span style="font-family: serif;">
        !ammo ${ch('<')}id${ch('>')} ${ch('<')}attribute ${ch('>')}
        ${ch('<')}amount${ch('>')} ${ch('[')}resource name${ch(']')}
      </span>
    </b>
    <div style="padding-left: 10px;padding-right:20px">
      This command requires 3 parameters:
      <ul>
        <li style="border-top: 1px solid #ccc;border-bottom: 1px solid #ccc;">
          <b><span style="font-family: serif;">id</span></b>
          -- The id of the character which has the attribute.
          You can pass this as ${ch('@')}${ch('{')}selected|token_id${ch('}')}
          and the character id will be pulled from represents field of the token.
        </li>
        <li style="border-top: 1px solid #ccc;border-bottom: 1px solid #ccc;">
          <b><span style="font-family: serif;">attribute</span></b>
          -- The name of the attribute representing ammunition.
        </li>
        <li style="border-top: 1px solid #ccc;border-bottom: 1px solid #ccc;">
          <b><span style="font-family: serif;">amount</span></b>
          -- The change to apply to the current quantity of ammo.
          Use negative numbers to decrease the amount, and positive numbers to
          increase it.
          You can use inline rolls to determine the number.
        </li>
        <li style="border-top: 1px solid #ccc;border-bottom: 1px solid #ccc;">
          <b><span style="font-family: serif;">resource name</span></b>
          -- Anything you put after the amount to adjust by will be used as the
          resource name (default: "ammo").
        </li>
      </ul>
    </div>
    <b><span style="font-family: serif;">
      !wammo ${ch('<')}id${ch('>')} ${ch('<')}attribute${ch('>')}
      ${ch('<')}amount${ch('>')} ${ch('[')}resource name${ch(']')}
    </span></b>
    <div style="padding-left: 10px;padding-right:20px">
      This command is identical to !ammo but will whisper all output.
    </div>
  </div>
</div>`
  helptext = helptext.replace(/(\r\n|\n\r|\n|\r)/gm, '');
  sendChat('', helptext);
}


handle_ammo_args = function (args) {
  let char_id = args[0];
  let attr_name = args[1];
  let amount = parseInt(args[2], 10);
  let ammo_name = _.rest(args,3).join(' ');
  return [char_id, attr_name, amount, ammo_name];
}


/**
* Function to adjust an ammo attribute by a specified amount.
*
* @author The Aaron
* @param {Object} char
* @param {String} who The display name of the Player who triggered the API call.
* @param {String} playerid The ID of the Player who triggered the API call
* @param {String} ammo_attribute_name
* @param {int} ammo_val_adjust
* @param {String} ammo_name
* @param {Boolean} whisperstate
* @param {Boolean} ignoreMissing
* @param {Boolean} allowPartial
* @return {None}
*/
adjustAmmo = function (char, who, playerid, ammo_attribute_name, ammo_val_adjust, ammo_name, whisperstate, ignoreMissing, allowPartial) {
  const ammo_attribute = attrLookup(char, ammo_attribute_name, false);

  if(!ammo_attribute) {
    if(!ignoreMissing) {
      if(char) {
        sendMessage(
          `Attribute [${args[1]}] was not found. `+
          `Please verify that you have the right name.`,
          (playerIsGM(msg.playerid) ? 'gm' : who),
          whisper
        );
        return;
      }
    } else {return showHelp(who, msg.playerid);}
  }

  const ammo_val_current = parseInt(ammo_attribute.get('current'), 10) || 0;
  const ammo_val_max = parseInt(ammo_attribute.get('max'), 10) || Number.MAX_SAFE_INTEGER;

  let new_ammo_val = (ammo_val_current + ammo_val_adjust);
  let overage = 0;
  let valid = true;

  if(allowPartial) {
    if (new_ammo_val < 0) {
      overage = Math.abs(new_ammo_val);
      new_ammo_val = 0;
    } else if( new_ammo_val > ammo_val_max ) {
      overage = new_ammo_val - ammo_val_max;
      new_ammo_val = ammo_val_max;
    }
  }

  if(new_ammo_val < 0 ) {
    sendMessage(
      `<b>${char.get('name')}</b> does not have enough <b>${ammo_name}</b>.
      Needs ${Math.abs(ammo_val_adjust)}, but only has
      <span style="color: #ff0000;">${ammo_val_current}</span>.
      <span style="font-weight:normal;color:#708090;>
      ${ch('[')}Attribute: ${ammo_attribute.get('name')} ${ch(']')}
      </span>`,
      who,
      whisperstate
    );
    valid = false;
  } else if( new_ammo_val > ammo_val_max) {
    sendMessage(
      `<b>${char.get('name')}</b>
      weapon does not have enough weapon space for <b>${ammo_name}</b>.
      Needs ${new_ammo_val}, but only has
      <span style="color: #ff0000;">${ammo_val_max}</span>.
      <span style="font-weight:normal;color:#708090;>
      ${ch('[')}Attribute: ${ammo_attribute.get('name')+ch(']')}
      </span>`,
      who,
      whisperstate
    );
    valid = false;
  }

  if ( playerIsGM(playerid) || valid ) {
    ammo_attribute.setWithWorker({current: new_ammo_val});
    let verb = (new_ammo_val < ammo_val_current) ? 'fire' : 'reload';
    sendMessage(
      `<b>${char.get('name')}</b>
      ${verb}s ${Math.abs(ammo_val_adjust)} <b>${ammo_name}</b> and has ${new_ammo_val}
      remaining in the weapon.
      ${overage ? `Unable to ${verb} ${overage} ${ammo_name}.`:''}`,
      who,
      whisperstate
    );
    if ( !valid ) {
      sendMessage(
        `Ignoring warnings and applying adjustment anyway.
        Was: ${ammo_val_current}/${ammo_val_max}
        Now: ${new_ammo_val}/${ammo_val_max}`,
        who,
        whisperstate
      );
    }
  }
}


/**

* @author A_Happy_Teacup
* @param {Object} char
* @param {String} who The display name of the Player who triggered the API call.
* @param {String} playerid The ID of the Player who triggered the API call
* @param {String} ammo_attribute_name
* @param {String} ammo_item_name
* @param {Boolean} whisperstate
* @param {Boolean} ignoreMissing
* @param {Boolean} allowPartial
* @return {None}
*/
adjustInventory = function (char, who, playerid, ammo_attribute_name, ammo_item_name, whisperstate, ignoreMissing, allowPartial) {
  const ammo_attribute = attrLookup(char, ammo_attribute_name, false);
  const ammo_val_current = parseInt(ammo_attribute.get('current'), 10) || 0;
  const ammo_val_max = parseInt(ammo_attribute.get('max'), 10) || Number.MAX_SAFE_INTEGER;
  const ammo_desired_adjust = (ammo_val_max - ammo_val_current);

  let ammo_potential_adjust = 0;
  let ammo_remaining_adjust = ammo_desired_adjust;

  var ammo_item_ids = get_character_item_rowids_by_name(char.id, ammo_item_name);
  var item_usages = ammo_item_ids.map(
    function (item_id) {
      let item_usage_obj = get_item_usage(char.id, item_id)
      item_usage_obj["item_row_id"] = item_id;
      log(`item_usages map > item_usage_obj > ${item_usage_obj}`);
      log(item_usage_obj);
      return item_usage_obj;
    }
  );
  item_usages.sort((obj) => parseInt(obj.get('current')));

  if ( ammo_item_ids.length === 0 ) {
    sendMessage(
      `<b>${char.get('name')}</b> wants to reload with '${ammo_item_name}' but
      has none in their inventory.`,
      who,
      whisperstate
    );
    return;
  }

  for ( let obj of item_usages ) {
    // TODO: We had this ID. Find a way to keep them linked.
    var item_rowid_regex = new RegExp('repeating_item_(.+?)(?:_uses)');
    let ammo_item_row_id = item_rowid_regex.exec(obj.get('name'))[1];
    let ammo_item_current_uses = parseInt(obj.get('current'), 10);
    if ( ammo_desired_adjust === 0 ) {
      // Was reload hit by mistake?
      sendMessage(
        `<b>${char.get('name')}</b> doesn't appear to require a reload.`,
        who,
        whisperstate
      );
    } else if ( ammo_item_current_uses === ammo_remaining_adjust ) {
      // The item has exactly the ammo needed to perform / complete a reload.
      let ammo_item_remaining_uses = ammo_item_current_uses - ammo_remaining_adjust;
      // This might be a risky assumption, but assume that a whole clip of
      // ammunition being used for a reload is for battery type mechanisms.
      if ( ammo_desired_adjust === parseInt(obj.get('max')) ) {
        adjust_item_quantity(char.id, ammo_item_row_id, -1)
        sendMessage(
          `<b>${char.get('name')}</b> uses a whole <b>${ammo_item_name}<b> for
          their reload.`,
          who,
          whisperstate
        );
      } else {
        adjust_item_usage(char.id, ammo_item_row_id, -ammo_remaining_adjust);
        sendMessage(
          `<b>${char.get('name')}</b>
          takes ${ammo_remaining_adjust} <b>${ammo_item_name}</b> from their
          inventory and has ${ammo_item_remaining_uses} remaining.`,
          who,
          whisperstate
        );
      }
      adjustAmmo(char, who, playerid, ammo_attribute_name, ammo_remaining_adjust, ammo_item_name, whisperstate, ignoreMissing, allowPartial);
      break;
    } else if ( ammo_item_current_uses > ammo_remaining_adjust ) {
      // The item has rounds, and completes the reload without being consumed.g
      let ammo_item_remaining_uses = ammo_item_current_uses - ammo_remaining_adjust;
      adjust_item_usage(char.id, ammo_item_row_id, -ammo_remaining_adjust);
      sendMessage(
        `<b>${char.get('name')}</b>
        takes ${ammo_remaining_adjust} <b>${ammo_item_name}</b> from their
        inventory and has ${ammo_item_remaining_uses} remaining.`,
        who,
        whisperstate
      );
      adjustAmmo(char, who, playerid, ammo_attribute_name, ammo_remaining_adjust, ammo_item_name, whisperstate, ignoreMissing, allowPartial);
      break;
    } else if ( ammo_item_current_uses < ammo_remaining_adjust ) {
      // The item has rounds, cannot complete the reload, but can contribute.
      // Don't break, so we can try the next item if their is one.
      ammo_remaining_adjust -= ammo_item_current_uses;
      sendMessage(
        `<b>${char.get('name')}</b>
        takes ${ammo_remaining_adjust} ${ammo_item_name}' from their
        inventory and drains the item.`,
        who,
        whisperstate
      );
      adjust_item_usage(char.id, ammo_item_row_id, -ammo_item_current_uses);
      adjustAmmo(char, who, playerid, ammo_attribute_name, ammo_item_current_uses, ammo_item_name, whisperstate, ignoreMissing, allowPartial);
    }
  }
  return;
}


/**
* Ammo API class.
*/
var Ammo = Ammo || (
  function() {
    'use strict';

    var handle_switches = function (switches) {
      let ignoreMissing = false;
      let allowPartial = false;
      switches.forEach(
        (s)=>{
          switch(s) {
            case '--help':
              return showHelp(who,msg.playerid);
            case '--ignore-missing':
              ignoreMissing = true;
              break;
            case '--allow-partial':
              allowPartial = true;
              break;
          }
        }
      );
      return {ignoreMissing: ignoreMissing, allowPartial: allowPartial};
    },

    HandleInput = function(msg_orig) {
      if (msg_orig.type !== "api") {return;}
      let who, args, switches;
      [who, args, switches] = processInputMessages(msg_orig);
      let msg = _.clone(msg_orig);
      let whisper = false;
      let handled_switches = handle_switches(switches);
      let ignoreMissing = false;
      let allowPartial = false;
      let char, token;

      switch(args.shift()) {
        case '!wammo':
          whisper = true;
        case '!ammo':
          if((args.length + switches.length) > 1) {
            ignoreMissing = handled_switches.ignoreMissing;
            allowPartial = handled_switches.allowPartial;
            let char_id, attr_name, amount, ammo_name;
            [char_id, attr_name, amount, ammo_name] = handle_ammo_args(args);
            try{
              [char, token] = get_char_and_token(
                char_id, msg.playerid, who, whisper
              );
            }
            catch(err) {
              if (err.type == "Permissions Error") {
                sendMessage(
                  `Additional details: <b>`+
                  getObj('player', msg.playerid).get('_displayname')
                  `</b>attempted to adjust attribute <b>${attr_name}</b> on `+
                  `character <b>${char.get('name')}</b>.`,
                  'gm',
                  whisper
                );
              }
              return;
            }
            adjustAmmo(char, who, msg.playerid, attr_name, amount, ammo_name, whisper, ignoreMissing, allowPartial);
            return;
          }
        case "!weload":
          whisper = true;
        case "!reload":
          if((args.length + switches.length) > 1) {
            ignoreMissing = handled_switches.ignoreMissing;
            allowPartial = handled_switches.allowPartial;
            let char_id, ammo_attribute_name, amount, ammo_item_name;
            [char_id, ammo_attribute_name, amount, ammo_item_name] = handle_ammo_args(args);
            try{
              [char, token] = get_char_and_token(
                args[0], msg.playerid, who, whisper
              );
            }
            catch(err) {
              if (err.type == "Permissions Error") {
                sendMessage(
                  `Additional details: <b>`+
                  getObj('player', msg.playerid).get('_displayname')
                  `</b>attempted to adjust attribute <b>${attr_name}</b> on `+
                  `character <b>${char.get('name')}</b>.`,
                  'gm',
                  whisper
                );
              }
              return;
            }
            adjustInventory(char, who, msg.playerid, ammo_attribute_name, ammo_item_name, whisper, ignoreMissing, allowPartial);
            return;
          } else {return showHelp(who, msg.playerid);}
      }
    },

    RegisterEventHandlers = function() {on('chat:message', HandleInput);};

    return {RegisterEventHandlers: RegisterEventHandlers};
  }()
);

on(
  "ready",
  function(){
    'use strict';
    Ammo.RegisterEventHandlers();
  }
);
