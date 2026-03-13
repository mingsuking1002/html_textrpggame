const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '../data/gamedata');

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, fileName), 'utf8'));
}

function hasKey(object, key) {
  return Boolean(object && Object.prototype.hasOwnProperty.call(object, key));
}

function pushError(errors, message) {
  errors.push(message);
  console.error(`ERROR: ${message}`);
}

function validate() {
  const classes = readJson('classes.json');
  const origins = readJson('origins.json');
  const symbols = readJson('symbols.json');
  const monsters = readJson('monsters.json');
  const encounters = readJson('encounters.json');
  const story = readJson('story.json');
  const endings = readJson('endings.json');

  const errors = [];

  Object.entries(classes).forEach(([classId, classData]) => {
    (classData.weapons || []).forEach((symbolId) => {
      if (!hasKey(symbols, symbolId)) {
        pushError(errors, `classes.${classId}.weapons references missing symbol: ${symbolId}`);
      }
    });
  });

  Object.entries(monsters).forEach(([monsterId, monsterData]) => {
    (monsterData.lootTable || []).forEach((lootEntry, index) => {
      if (!hasKey(symbols, lootEntry.symbolId)) {
        pushError(errors, `monsters.${monsterId}.lootTable[${index}] references missing symbol: ${lootEntry.symbolId}`);
      }
    });
  });

  Object.entries(encounters).forEach(([encounterId, encounterData]) => {
    const encounterType = String(encounterData.type || '').toLowerCase();

    (encounterData.monsters || []).forEach((monsterId) => {
      if (!hasKey(monsters, monsterId)) {
        pushError(errors, `encounters.${encounterId}.monsters references missing monster: ${monsterId}`);
      }
    });

    if (encounterData.storyNodeId && !hasKey(story, encounterData.storyNodeId)) {
      pushError(errors, `encounters.${encounterId}.storyNodeId references missing story node: ${encounterData.storyNodeId}`);
    }

    if (!['combat', 'reward'].includes(encounterType) && !encounterData.storyNodeId) {
      pushError(errors, `encounters.${encounterId} (${encounterType || 'unknown'}) requires storyNodeId`);
    }
  });

  Object.entries(story).forEach(([nodeId, nodeData]) => {
    (nodeData.encounterPool || []).forEach((encounterId) => {
      if (!hasKey(encounters, encounterId)) {
        pushError(errors, `story.${nodeId}.encounterPool references missing encounter: ${encounterId}`);
      }
    });

    (nodeData.shopItems || []).forEach((shopItem, index) => {
      if (!hasKey(symbols, shopItem.symbolId)) {
        pushError(errors, `story.${nodeId}.shopItems[${index}] references missing symbol: ${shopItem.symbolId}`);
      }
    });

    if (nodeData.endingId && !hasKey(endings, nodeData.endingId)) {
      pushError(errors, `story.${nodeId}.endingId references missing ending: ${nodeData.endingId}`);
    }

    if (nodeData.combatMonster && !hasKey(monsters, nodeData.combatMonster)) {
      pushError(errors, `story.${nodeId}.combatMonster references missing monster: ${nodeData.combatMonster}`);
    }

    (nodeData.choices || []).forEach((choice, index) => {
      if (choice.nextNodeId && choice.nextNodeId !== '$return' && !hasKey(story, choice.nextNodeId)) {
        pushError(errors, `story.${nodeId}.choices[${index}] references missing story node: ${choice.nextNodeId}`);
      }
    });
  });

  if (errors.length > 0) {
    console.error(`\nvalidate-gamedata: failed with ${errors.length} error(s).`);
    process.exitCode = 1;
    return;
  }

  console.log('validate-gamedata: OK');
  console.log(`classes=${Object.keys(classes).length}`);
  console.log(`origins=${Object.keys(origins).length}`);
  console.log(`symbols=${Object.keys(symbols).length}`);
  console.log(`monsters=${Object.keys(monsters).length}`);
  console.log(`encounters=${Object.keys(encounters).length}`);
  console.log(`story=${Object.keys(story).length}`);
  console.log(`endings=${Object.keys(endings).length}`);
}

validate();
