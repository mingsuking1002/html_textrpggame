const PROJECT_PH_SHEET_DEFINITIONS = Object.freeze([
  {
    title: 'classes',
    headers: ['id', 'name', 'icon', 'description', 'base_hp', 'base_gold', 'deck_size', 'theme_color', 'is_enabled'],
  },
  {
    title: 'class_weapons',
    headers: ['class_id', 'symbol_id', 'sort_order'],
  },
  {
    title: 'class_starting_deck',
    headers: ['class_id', 'symbol_id', 'count', 'sort_order', 'source'],
  },
  {
    title: 'symbols',
    headers: ['id', 'name', 'type', 'value', 'rarity', 'class_tag', 'icon', 'description', 'tags', 'is_enabled'],
  },
  {
    title: 'monsters',
    headers: ['id', 'name', 'hp', 'attack', 'defense', 'exp_reward', 'gold_min', 'gold_max', 'icon', 'tier', 'tags', 'is_enabled'],
  },
  {
    title: 'monster_loot',
    headers: ['monster_id', 'symbol_id', 'drop_rate', 'sort_order'],
  },
  {
    title: 'encounters',
    headers: ['id', 'name', 'type', 'description', 'story_node_id', 'weight', 'min_stage', 'max_stage', 'required_flags', 'is_enabled'],
  },
  {
    title: 'encounter_monsters',
    headers: ['encounter_id', 'monster_id', 'sort_order'],
  },
  {
    title: 'encounter_reward_ranges',
    headers: ['encounter_id', 'reward_type', 'min_value', 'max_value'],
  },
  {
    title: 'encounter_reward_symbols',
    headers: ['encounter_id', 'symbol_id', 'chance', 'sort_order'],
  },
  {
    title: 'story_nodes',
    headers: ['id', 'type', 'title', 'body', 'after_encounter', 'combat_monster', 'on_win', 'on_lose', 'ending_id', 'is_enabled'],
  },
  {
    title: 'story_choices',
    headers: ['node_id', 'choice_id', 'choice_text', 'next_node_id', 'condition_has_flag', 'condition_min_stage', 'condition_max_stage', 'effect_add_flag', 'effect_remove_flag', 'effect_heal', 'effect_add_gold', 'sort_order'],
  },
  {
    title: 'story_shop_items',
    headers: ['node_id', 'symbol_id', 'cost', 'stock', 'sort_order'],
  },
  {
    title: 'story_encounter_pool',
    headers: ['node_id', 'encounter_id', 'sort_order'],
  },
  {
    title: 'story_on_enter',
    headers: ['node_id', 'add_flag', 'heal', 'add_gold'],
  },
  {
    title: 'endings',
    headers: ['id', 'name', 'type', 'description', 'payout_multiplier', 'is_rankable', 'bonus_gold', 'icon', 'is_enabled'],
  },
  {
    title: 'ending_required_flags',
    headers: ['ending_id', 'flag', 'sort_order'],
  },
  {
    title: 'config',
    headers: ['group', 'key', 'value', 'type', 'note'],
  },
  {
    title: 'config_synergies',
    headers: ['sort_order', 'type', 'min_count', 'bonus_per_extra', 'label'],
  },
  {
    title: 'config_sound_bgm',
    headers: ['track_id', 'path'],
  },
  {
    title: 'config_sound_sfx',
    headers: ['sfx_id', 'path'],
  },
  {
    title: 'config_upgrades',
    headers: ['id', 'name', 'description', 'cost', 'max_level', 'effect_key', 'effect_value', 'icon'],
  },
]);

module.exports = {
  PROJECT_PH_SHEET_DEFINITIONS,
};
