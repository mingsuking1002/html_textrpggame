function defineSheet(key, title, headers, aliases = []) {
  return Object.freeze({
    // key: internal row bucket identifier, title: actual Google Sheets tab name
    key,
    title,
    aliases: Object.freeze([...aliases]),
    headers: Object.freeze([...headers]),
  });
}

const PROJECT_PH_SHEET_DEFINITIONS = Object.freeze([
  defineSheet(
    'classes',
    'ClassData',
    ['id', 'name', 'icon', 'description', 'base_hp', 'base_gold', 'deck_size', 'theme_color', 'is_enabled'],
    ['classes'],
  ),
  defineSheet(
    'class_weapons',
    'ClassWeaponData',
    ['class_id', 'symbol_id', 'sort_order'],
    ['class_weapons'],
  ),
  defineSheet(
    'class_starting_deck',
    'ClassStartingData',
    ['class_id', 'symbol_id', 'count', 'sort_order', 'source'],
    ['class_starting_deck', 'ClassstartingData'],
  ),
  defineSheet(
    'symbols',
    'SymbolData',
    ['id', 'name', 'type', 'value', 'rarity', 'class_tag', 'icon', 'description', 'tags', 'is_enabled'],
    ['symbols'],
  ),
  defineSheet(
    'monsters',
    'MonsterData',
    ['id', 'name', 'hp', 'attack', 'defense', 'exp_reward', 'gold_min', 'gold_max', 'icon', 'tier', 'tags', 'is_enabled'],
    ['monsters'],
  ),
  defineSheet(
    'monster_loot',
    'DropData',
    ['monster_id', 'symbol_id', 'drop_rate', 'sort_order'],
    ['monster_loot'],
  ),
  defineSheet(
    'encounters',
    'EncounterData',
    ['id', 'name', 'type', 'description', 'story_node_id', 'weight', 'min_stage', 'max_stage', 'required_flags', 'is_enabled'],
    ['encounters'],
  ),
  defineSheet(
    'encounter_monsters',
    'EncounterMonsterData',
    ['encounter_id', 'monster_id', 'sort_order'],
    ['encounter_monsters'],
  ),
  defineSheet(
    'encounter_reward_ranges',
    'EncounterRewardRangeData',
    ['encounter_id', 'reward_type', 'min_value', 'max_value'],
    ['encounter_reward_ranges'],
  ),
  defineSheet(
    'encounter_reward_symbols',
    'EncounterRewardSymbolData',
    ['encounter_id', 'symbol_id', 'chance', 'sort_order'],
    ['encounter_reward_symbols'],
  ),
  defineSheet(
    'story_nodes',
    'MainStoryNodeData',
    ['id', 'type', 'title', 'body', 'after_encounter', 'combat_monster', 'on_win', 'on_lose', 'ending_id', 'is_enabled'],
    ['story_nodes'],
  ),
  defineSheet(
    'story_choices',
    'StoryChoiceData',
    ['node_id', 'choice_id', 'choice_text', 'next_node_id', 'condition_has_flag', 'condition_min_stage', 'condition_max_stage', 'effect_add_flag', 'effect_remove_flag', 'effect_heal', 'effect_add_gold', 'sort_order'],
    ['story_choices'],
  ),
  defineSheet(
    'story_shop_items',
    'StoryShopItemData',
    ['node_id', 'symbol_id', 'cost', 'stock', 'sort_order'],
    ['story_shop_items'],
  ),
  defineSheet(
    'story_encounter_pool',
    'StoryEncounterPoolData',
    ['node_id', 'encounter_id', 'sort_order'],
    ['story_encounter_pool'],
  ),
  defineSheet(
    'story_on_enter',
    'StoryOnEnterData',
    ['node_id', 'add_flag', 'heal', 'add_gold'],
    ['story_on_enter'],
  ),
  defineSheet(
    'endings',
    'EndingData',
    ['id', 'name', 'type', 'description', 'payout_multiplier', 'is_rankable', 'bonus_gold', 'icon', 'is_enabled'],
    ['endings'],
  ),
  defineSheet(
    'ending_required_flags',
    'EndingRequiredFlagData',
    ['ending_id', 'flag', 'sort_order'],
    ['ending_required_flags'],
  ),
  defineSheet(
    'config',
    'ConfigData',
    ['group', 'key', 'value', 'type', 'note'],
    ['config'],
  ),
  defineSheet(
    'config_synergies',
    'ConfigSynergyData',
    ['sort_order', 'type', 'min_count', 'bonus_per_extra', 'label'],
    ['config_synergies'],
  ),
  defineSheet(
    'config_sound_bgm',
    'ConfigSoundBgmData',
    ['track_id', 'path'],
    ['config_sound_bgm'],
  ),
  defineSheet(
    'config_sound_sfx',
    'ConfigSoundSfxData',
    ['sfx_id', 'path'],
    ['config_sound_sfx'],
  ),
  defineSheet(
    'config_upgrades',
    'ConfigUpgradeData',
    ['id', 'name', 'description', 'cost', 'max_level', 'effect_key', 'effect_value', 'icon'],
    ['config_upgrades'],
  ),
]);

const PROJECT_PH_SHEET_TITLES = Object.freeze(
  Object.fromEntries(PROJECT_PH_SHEET_DEFINITIONS.map((definition) => [definition.key, definition.title])),
);

module.exports = {
  PROJECT_PH_SHEET_DEFINITIONS,
  PROJECT_PH_SHEET_TITLES,
};
