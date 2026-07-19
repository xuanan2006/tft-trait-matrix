import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const communityDragonRoot = 'https://raw.communitydragon.org';
const defaultVersion = 'latest';
const pbeVersion = 'pbe';
const set18PreviewSetId = 'preview:set18';
const set18LuxSelectionGroupId = 'set18-lux';
const set18LuxVariantPattern =
  /^TFT18_Lux(Blossom|Coven|Elderwood|Eldritch|Fae|Inferno|Lunar|Primal|Solar)$/i;
const rootDir = fileURLToPath(new URL('../', import.meta.url));
const dataPath = path.join(rootDir, 'public', 'data', 'tft-current.json');

const set18PreviewSources = {
  tacticsTools: 'https://tactics.tools/tc/info/set-update',
  mobalyticsChampions: 'https://mobalytics.gg/tft/set18/champions',
  mobalyticsReveal: 'https://mobalytics.gg/tft/guides/set-18-reveal-enchanted-wilds',
  lolchess: 'https://lolchess.gg/tft/18?hl=en',
  outOfGamesChampions:
    'https://outof.games/realms/tft/guides/575-all-champions-in-teamfight-tactics-enchanted-wilds-set-18/',
  outOfGamesTraits:
    'https://outof.games/realms/tft/guides/574-all-traits-in-teamfight-tactics-enchanted-wilds-set-18/'
};

const set18PreviewOption = {
  id: set18PreviewSetId,
  name: 'Set 18 Preview',
  number: 18,
  championCount: 65,
  traitCount: 35,
  isDefault: false,
  preview: true
};

const originTraitNames = new Set([
  'academy',
  'anima',
  'animasquad',
  'arcana',
  'arbiter',
  'astral',
  'bilgewater',
  'blackrose',
  'blossom',
  'bulwark',
  'celestial',
  'commander',
  'coven',
  'darklady',
  'darkstar',
  'disco',
  'divineduelist',
  'doomer',
  'dragon',
  'elderwood',
  'eldritch',
  'emissary',
  'experiment',
  'fae',
  'faerie',
  'florafatalis',
  'forgotten',
  'freljord',
  'galaxyhunter',
  'gungoddess',
  'hextech',
  'highnoon',
  'honeymancy',
  'inferno',
  'ionia',
  'ixtal',
  'jazz',
  'kda',
  'lunar',
  'mecha',
  'meeple',
  'mightymech',
  'mixmaster',
  'mountain',
  'nova',
  'noxus',
  'partyanimal',
  'phantom',
  'primal',
  'primordian',
  'psionic',
  'punk',
  'redeemer',
  'rebel',
  'riftbeast',
  'rival',
  'scrap',
  'sentinel',
  'shadowisles',
  'shurima',
  'solar',
  'spacegroove',
  'sprykin',
  'stargazer',
  'starguardian',
  'steel',
  'storyweaver',
  'superfan',
  'syndicate',
  'timebreaker',
  'void',
  'zaun'
]);

const classTraitNames = new Set([
  'adaptor',
  'ambusher',
  'artillerist',
  'assassin',
  'bastion',
  'behemoth',
  'bigshot',
  'blademaster',
  'blaster',
  'brawler',
  'bruiser',
  'challenger',
  'channeler',
  'conduit',
  'defender',
  'duelist',
  'empath',
  'enforcer',
  'eradicator',
  'executioner',
  'factorynew',
  'fateweaver',
  'fighter',
  'formswapper',
  'guardian',
  'heavyweight',
  'hunter',
  'incantor',
  'invoker',
  'juggernaut',
  'mage',
  'marauder',
  'marksman',
  'multistriker',
  'mystic',
  'preserver',
  'protector',
  'quickstriker',
  'rapidfire',
  'ravager',
  'reaper',
  'replicator',
  'rogue',
  'scholar',
  'sentinelclass',
  'shapeshifter',
  'shepherd',
  'slayer',
  'sniper',
  'sorcerer',
  'spellweaver',
  'strategist',
  'summoner',
  'trickshot',
  'vanguard',
  'visionary',
  'voyager',
  'warden',
  'warrior'
]);

export async function getAvailableVersions() {
  try {
    const response = await fetch(`${communityDragonRoot}/`, {
      headers: { Accept: 'text/html' }
    });

    if (!response.ok) {
      throw new Error(`CommunityDragon returned ${response.status}`);
    }

    const html = await response.text();
    const versions = Array.from(html.matchAll(/href="(\d+\.\d+)\/?"/g), (match) => match[1]);
    const uniqueVersions = Array.from(new Set(versions)).sort(compareVersionsDesc);
    return [defaultVersion, pbeVersion, ...uniqueVersions];
  } catch {
    return [defaultVersion, pbeVersion];
  }
}

export async function getAvailableSets(version = defaultVersion) {
  const normalizedVersion = normalizeVersion(version);

  try {
    const raw = await fetchTftData(normalizedVersion);
    const playableSets = listPlayableSets(raw.sets ?? {});
    const defaultSetId = playableSets[0]?.setId ?? '';
    const sets = playableSets.map(({ setId, set, numericId }) => ({
      id: setId,
      name: safeText(set.name ?? `Set ${setId}`),
      number: numericId,
      championCount: set.champions.length,
      traitCount: set.traits.length,
      isDefault: setId === defaultSetId
    }));

    if (supportsSet18Preview(normalizedVersion) && !hasCompleteSet18(playableSets)) {
      sets.push(set18PreviewOption);
    }

    return sets;
  } catch (error) {
    if (supportsSet18Preview(normalizedVersion)) {
      return [set18PreviewOption];
    }
    throw error;
  }
}

export async function updateTftData(options = {}) {
  const normalized = await buildTftData(options);

  await fs.mkdir(path.dirname(dataPath), { recursive: true });
  await fs.writeFile(dataPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}

export async function buildTftData(options = {}) {
  const version = normalizeVersion(options.version);
  const requestedSetId = safeText(options.setId);
  return requestedSetId === set18PreviewSetId
    ? normalizeSet18PreviewOrCommunityDragon(version)
    : normalizeCommunityDragonSnapshot(version, requestedSetId);
}

async function normalizeCommunityDragonSnapshot(version, requestedSetId) {
  const raw = await fetchTftData(version);
  return normalizeTftData(raw, {
    version,
    setId: requestedSetId
  });
}

async function normalizeSet18PreviewOrCommunityDragon(version) {
  const warnings = [];

  try {
    const raw = await fetchTftData(version);
    const selectedSet = findCompleteSet18(raw.sets ?? {});
    if (selectedSet) {
      const normalized = normalizeTftData(raw, {
        version,
        setId: selectedSet.setId
      });
      normalized.meta.warnings = warnings;
      return normalized;
    }

    warnings.push(
      `CommunityDragon ${version} does not expose a complete Set 18 object yet; using preview sources.`
    );
  } catch (error) {
    warnings.push(`CommunityDragon ${version} could not be checked: ${readError(error)}`);
  }

  return buildSet18PreviewSnapshot({
    version,
    inheritedWarnings: warnings
  });
}

async function fetchTftData(version) {
  const normalizedVersion = normalizeVersion(version);
  const sourceUrl = buildSourceUrl(normalizedVersion);
  const response = await fetch(sourceUrl, {
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`CommunityDragon returned ${response.status}`);
  }

  return response.json();
}

async function buildSet18PreviewSnapshot({ version, inheritedWarnings }) {
  const warnings = [...inheritedWarnings];
  const sourceRecords = createPreviewSourceRecords();

  const tacticsHtml = await fetchSourceText({
    id: 'tactics.tools',
    url: set18PreviewSources.tacticsTools,
    sourceRecords,
    warnings,
    required: true
  });
  const tacticsChampions = parseTacticsToolsChampions(tacticsHtml, warnings);

  if (tacticsChampions.length < 40) {
    throw new Error(
      `tactics.tools Set 18 preview parse produced only ${tacticsChampions.length} units.`
    );
  }

  const outOfGamesChampionsHtml = await fetchSourceText({
    id: 'outof.games champions',
    url: set18PreviewSources.outOfGamesChampions,
    sourceRecords,
    warnings
  });
  const outOfGamesTraitsHtml = await fetchSourceText({
    id: 'outof.games traits',
    url: set18PreviewSources.outOfGamesTraits,
    sourceRecords,
    warnings
  });
  const mobalyticsHtml = await fetchSourceText({
    id: 'mobalytics',
    url: set18PreviewSources.mobalyticsChampions,
    sourceRecords,
    warnings
  });
  const lolchessHtml = await fetchSourceText({
    id: 'lolchess',
    url: set18PreviewSources.lolchess,
    sourceRecords,
    warnings
  });

  const championEnrichment = mergeChampionEnrichment(
    parseOutOfGamesChampions(outOfGamesChampionsHtml, warnings),
    parseMobalyticsChampions(mobalyticsHtml, warnings)
  );
  const traitEnrichment = parseOutOfGamesTraits(outOfGamesTraitsHtml, warnings);

  validateChampionSource({
    html: outOfGamesChampionsHtml,
    label: 'Out of Games champion guide',
    champions: tacticsChampions,
    warnings
  });
  validateChampionSource({
    html: lolchessHtml,
    label: 'LoLChess Set 18 page',
    champions: tacticsChampions,
    warnings
  });

  return normalizePreviewData({
    version,
    tacticsChampions,
    championEnrichment,
    traitEnrichment,
    sourceRecords,
    warnings
  });
}

function normalizeTftData(raw, options) {
  const selectedSet = selectPlayableSet(raw.sets ?? {}, options.setId);
  if (!selectedSet) {
    throw new Error('No playable TFT set was found in the CommunityDragon response.');
  }

  const { setId, set } = selectedSet;
  const rawTraits = Array.isArray(set.traits) ? set.traits : [];
  const rawChampions = Array.isArray(set.champions) ? set.champions : [];
  const traitLookup = new Map();
  const fetchedAt = new Date().toISOString();

  const allTraits = rawTraits
    .map((trait) => {
      const apiName = safeText(trait.apiName ?? trait.name ?? trait.displayName);
      const name = safeText(trait.name ?? trait.displayName ?? titleFromApi(apiName));
      const normalizedTrait = {
        id: makeId(apiName || name),
        apiName,
        name,
        category: classifyTrait(trait),
        iconUrl: toCdragonAssetUrl(trait.icon, options.version),
        effects: normalizeTraitEffects(trait.effects),
        preview: false,
        fieldSources: {
          roster: 'communityDragon',
          category: 'communityDragon',
          effects: 'communityDragon',
          icon: 'communityDragon'
        }
      };

      for (const key of [
        apiName,
        trait.name,
        trait.displayName,
        stripTftPrefix(apiName),
        normalizeTraitName(apiName),
        normalizeTraitName(name)
      ]) {
        const normalizedKey = normalizeLookupKey(key);
        if (normalizedKey) {
          traitLookup.set(normalizedKey, normalizedTrait.id);
        }
      }

      return normalizedTrait;
    })
    .filter((trait) => trait.id && trait.name)
    .sort((a, b) => a.name.localeCompare(b.name));

  const traitsById = new Map(allTraits.map((trait) => [trait.id, trait]));

  const units = rawChampions
    .map((champion) => normalizeChampion(champion, traitLookup, traitsById, options.version))
    .filter(Boolean)
    .map((unit) => applySet18UnitRules(unit))
    .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));

  const traitUsageCounts = countTraitRosterUsage(units);

  const usedTraitIds = new Set(traitUsageCounts.keys());
  const traits = allTraits
    .filter((trait) => usedTraitIds.has(trait.id))
    .map((trait) => ({
      ...trait,
      isUnique: (traitUsageCounts.get(trait.id) ?? 0) <= 1
    }));

  return {
    meta: {
      sourceUrl: buildSourceUrl(options.version),
      fetchedAt,
      sourceVersion: raw.version ?? options.version,
      version: options.version,
      setId,
      setName: safeText(set.name ?? `Set ${setId}`),
      preview: false,
      sourceMode: 'communityDragon',
      canonicalSource: 'communityDragon',
      sources: [
        {
          id: 'communityDragon',
          label: 'CommunityDragon',
          role: 'canonical json',
          url: buildSourceUrl(options.version),
          status: 'ok'
        }
      ],
      warnings: [],
      verifiedAt: fetchedAt
    },
    traits,
    units
  };
}

function normalizePreviewData({
  version,
  tacticsChampions,
  championEnrichment,
  traitEnrichment,
  sourceRecords,
  warnings
}) {
  const fetchedAt = new Date().toISOString();
  const traitLookup = new Map();
  const traitRosterMembers = new Map();

  for (const champion of tacticsChampions) {
    for (const traitApiName of champion.traits) {
      const traitId = makeId(traitApiName);
      const rosterMembers = traitRosterMembers.get(traitId) ?? new Set();
      rosterMembers.add(set18RosterIdentity(champion.apiName));
      traitRosterMembers.set(traitId, rosterMembers);
    }
  }

  const traitUsageCounts = new Map(
    Array.from(traitRosterMembers, ([traitId, rosterMembers]) => [traitId, rosterMembers.size])
  );

  const traits = Array.from(traitUsageCounts.keys())
    .map((traitId) => {
      const apiName = Array.from(tacticsChampions)
        .flatMap((champion) => champion.traits)
        .find((traitApiName) => makeId(traitApiName) === traitId);
      const enrichment = traitEnrichment.get(traitId);
      const fallbackName = titleFromApi(apiName);
      const effects = normalizePreviewTraitEffects(enrichment?.effects ?? []);
      const usesLocalPrismaticRule =
        effects.some((effect) => effect.style >= 6) &&
        !(enrichment?.effects ?? []).some((effect) => Number(effect.style) >= 6);
      const trait = {
        id: traitId,
        apiName,
        name: enrichment?.name ?? fallbackName,
        category: enrichment?.category ?? classifyTrait({ apiName, name: fallbackName }),
        iconUrl: tacticsTraitIconUrl(apiName),
        description: enrichment?.description ?? null,
        effects,
        preview: true,
        fieldSources: {
          roster: 'tactics.tools',
          category: enrichment ? 'outof.games' : 'local override',
          description: enrichment?.description ? 'outof.games' : null,
          effects: enrichment?.effects?.length
            ? usesLocalPrismaticRule
              ? 'outof.games + local Set 18 tier rule'
              : 'outof.games'
            : null,
          icon: 'tactics.tools'
        },
        isUnique: (traitUsageCounts.get(traitId) ?? 0) <= 1
      };

      traitLookup.set(traitId, trait);
      return trait;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const traitsById = new Map(traits.map((trait) => [trait.id, trait]));

  const units = tacticsChampions
    .map((champion) => {
      const championId = makeId(champion.apiName);
      const enrichment =
        championEnrichment.get(championId) ??
        (getSet18LuxVariantLabel(champion.apiName) ? championEnrichment.get('lux') : undefined);
      const allTraitIds = champion.traits.map((traitApiName) => makeId(traitApiName));

      comparePreviewChampion(champion, enrichment, warnings);

      const abilityName = enrichment?.ability?.name ?? champion.ability.name ?? null;
      const abilityDescription = enrichment?.ability?.description ?? champion.ability.description ?? null;
      const manaStart = enrichment?.manaStart ?? champion.manaStart ?? null;
      const manaMax = enrichment?.manaMax ?? champion.manaMax ?? null;

      return applySet18UnitRules({
        id: championId,
        apiName: champion.apiName,
        name: enrichment?.name ?? titleFromApi(champion.apiName),
        cost: champion.cost,
        range: champion.range,
        manaStart,
        manaMax,
        ability: {
          name: abilityName,
          description: abilityDescription
        },
        iconUrl: champion.iconUrl,
        originTraitIds: allTraitIds.filter((traitId) => traitsById.get(traitId)?.category === 'origin'),
        classTraitIds: allTraitIds.filter((traitId) => traitsById.get(traitId)?.category === 'class'),
        unknownTraitIds: allTraitIds.filter(
          (traitId) => traitsById.get(traitId)?.category === 'unknown'
        ),
        allTraitIds,
        preview: true,
        fieldSources: {
          roster: 'tactics.tools',
          cost: 'tactics.tools',
          traits: 'tactics.tools',
          range: champion.range == null ? null : 'tactics.tools',
          mana: manaStart == null && manaMax == null ? null : enrichment?.manaMax ? 'outof.games' : 'tactics.tools',
          ability: abilityName || abilityDescription ? 'outof.games' : null,
          icon: 'tactics.tools'
        }
      });
    })
    .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));

  const limitedWarnings = Array.from(new Set(warnings)).slice(0, 40);

  return {
    meta: {
      sourceUrl: set18PreviewSources.tacticsTools,
      fetchedAt,
      sourceVersion: version,
      version,
      setId: set18PreviewSetId,
      setName: 'Set 18 Preview: Enchanted Wilds',
      preview: true,
      sourceMode: 'hybrid-preview',
      canonicalSource: 'tactics.tools',
      sources: sourceRecords,
      warnings: limitedWarnings,
      verifiedAt: fetchedAt
    },
    traits,
    units
  };
}

function normalizeChampion(champion, traitLookup, traitsById, version) {
  const apiName = safeText(champion.apiName ?? champion.characterName ?? champion.name);
  const name = safeText(champion.name ?? titleFromApi(apiName));
  const cost = Number(champion.cost ?? champion.tier ?? 0);

  if (!apiName || !name || !Number.isFinite(cost) || cost <= 0 || !Array.isArray(champion.traits)) {
    return null;
  }

  const allTraitIds = Array.from(
    new Set(
      champion.traits
        .map((traitName) => traitLookup.get(normalizeLookupKey(traitName)))
        .filter(Boolean)
    )
  );

  if (allTraitIds.length === 0) {
    return null;
  }

  const originTraitIds = allTraitIds.filter((traitId) => traitsById.get(traitId)?.category === 'origin');
  const classTraitIds = allTraitIds.filter((traitId) => traitsById.get(traitId)?.category === 'class');
  const unknownTraitIds = allTraitIds.filter(
    (traitId) => traitsById.get(traitId)?.category === 'unknown'
  );

  return {
    id: makeId(apiName),
    apiName,
    name,
    cost,
    range: normalizeRange(champion.stats?.range),
    iconUrl: toCdragonAssetUrl(champion.squareIcon ?? champion.tileIcon ?? champion.icon, version),
    originTraitIds,
    classTraitIds,
    unknownTraitIds,
    allTraitIds,
    preview: false,
    fieldSources: {
      roster: 'communityDragon',
      cost: 'communityDragon',
      traits: 'communityDragon',
      range: 'communityDragon',
      icon: 'communityDragon'
    }
  };
}

function applySet18UnitRules(unit) {
  const luxVariantLabel = getSet18LuxVariantLabel(unit.apiName);
  if (luxVariantLabel) {
    const variantTraitId = makeId(luxVariantLabel);
    const contributionTraitId = unit.allTraitIds.includes(variantTraitId)
      ? variantTraitId
      : unit.originTraitIds[0];

    return {
      ...unit,
      name: 'Lux',
      variantLabel: luxVariantLabel,
      selectionGroupId: set18LuxSelectionGroupId,
      traitContributions: contributionTraitId ? { [contributionTraitId]: 2 } : undefined,
      fieldSources: {
        ...unit.fieldSources,
        traitContributions: contributionTraitId ? 'local Set 18 rule' : null
      }
    };
  }

  if (/^TFT18_ElderDragon$/i.test(unit.apiName) && unit.allTraitIds.includes('riftbeast')) {
    return {
      ...unit,
      traitContributions: { riftbeast: 2 },
      fieldSources: {
        ...unit.fieldSources,
        traitContributions: 'local Set 18 rule'
      }
    };
  }

  return unit;
}

function getSet18LuxVariantLabel(apiName) {
  const match = safeText(apiName).match(set18LuxVariantPattern);
  return match ? titleFromApi(match[1]) : null;
}

function set18RosterIdentity(apiName) {
  return getSet18LuxVariantLabel(apiName) ? set18LuxSelectionGroupId : makeId(apiName);
}

function countTraitRosterUsage(units) {
  const rosterMembersByTrait = new Map();
  for (const unit of units) {
    const rosterIdentity = unit.selectionGroupId ?? unit.id;
    for (const traitId of unit.allTraitIds) {
      const rosterMembers = rosterMembersByTrait.get(traitId) ?? new Set();
      rosterMembers.add(rosterIdentity);
      rosterMembersByTrait.set(traitId, rosterMembers);
    }
  }

  return new Map(
    Array.from(rosterMembersByTrait, ([traitId, rosterMembers]) => [traitId, rosterMembers.size])
  );
}

function parseTacticsToolsChampions(html, warnings) {
  const champions = [];
  const cardBlocks = safeText(html)
    .split('<div class=" rounded text-white1 w-[291px] flex flex-col bg-bg">')
    .slice(1);

  for (const block of cardBlocks) {
    const header = block.match(
      />(TFT18_[A-Za-z0-9]+)<div class="flex items-end text-\[16px\]">(\d+)/
    );
    if (!header || !block.includes('_ability')) {
      continue;
    }

    const apiName = header[1];
    const cost = Number(header[2]);
    const traitRegionEnd = block.indexOf('<div class="p-3 flex flex-col text-sm">');
    const traitRegion = traitRegionEnd >= 0 ? block.slice(0, traitRegionEnd) : block;
    const traitApiNames = Array.from(
      new Set(
        Array.from(traitRegion.matchAll(/alt="(TFT18_[A-Za-z0-9]+) 0"/g), (match) => match[1])
      )
    ).filter((traitApiName) => traitApiName !== apiName);

    if (!Number.isFinite(cost) || cost <= 0 || traitApiNames.length === 0) {
      continue;
    }

    const range = normalizeRange(matchFirst(block, /alt="Range"[\s\S]*?break-all">([^<]+)<\/div>/));
    const mana = parseMana(matchFirst(block, /alt="Mana"[\s\S]*?<div class="pt-\[1px\]">([^<]+)<\/div>/));
    const abilityName = normalizePreviewText(matchFirst(block, /<div class="font-medium text-sm">([^<]+)<\/div>/));
    const abilityDescription = normalizePreviewText(
      matchFirst(block, /<div class="leading-tight "><span class=""><span>([\s\S]*?)<\/span><\/span><\/div>/)
    );

    champions.push({
      apiName,
      cost,
      traits: traitApiNames,
      range,
      manaStart: mana.manaStart,
      manaMax: mana.manaMax,
      ability: {
        name: abilityName,
        description: abilityDescription
      },
      iconUrl: tacticsChampionIconUrl(apiName)
    });
  }

  const uniqueChampions = Array.from(
    new Map(champions.map((champion) => [champion.apiName, champion])).values()
  );
  if (uniqueChampions.length !== champions.length) {
    warnings.push('Duplicate tactics.tools Set 18 champion cards were collapsed by champion id.');
  }
  return uniqueChampions;
}

function parseOutOfGamesChampions(html, warnings) {
  const records = new Map();
  if (!html) {
    return records;
  }

  const tokens = Array.from(
    html.matchAll(/<h2 id="(?<cost>\d)-cost-champions">|<h3 id="(?<slug>[^"]+)">(?<name>[^<]+)<\/h3>/g)
  );
  let currentCost = null;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.groups?.cost) {
      currentCost = Number(token.groups.cost);
      continue;
    }

    const name = normalizePreviewText(token.groups?.name);
    if (!name || !currentCost) {
      continue;
    }

    const blockStart = (token.index ?? 0) + token[0].length;
    const blockEnd = tokens[index + 1]?.index ?? html.length;
    const block = html.slice(blockStart, blockEnd);
    const paragraphs = Array.from(block.matchAll(/<p>([\s\S]*?)<\/p>/g), (match) => match[1]);
    const firstParagraph = paragraphs[0] ?? '';
    const traitsAndAbility = firstParagraph.match(
      /<strong>Traits:<\/strong>\s*([\s\S]*?)\s*<strong>Ability:<\/strong>\s*([\s\S]*)/i
    );

    if (!traitsAndAbility) {
      continue;
    }

    const traits = stripHtml(traitsAndAbility[1])
      .split(/\u2022|,|\//)
      .map((traitName) => normalizePreviewText(traitName))
      .filter(Boolean);
    const ability = parseAbilitySummary(stripHtml(traitsAndAbility[2]));
    const description = normalizePreviewText(paragraphs[1]);
    const id = makeId(`TFT18_${name.replace(/\s+/g, '')}`);

    records.set(id, {
      name,
      cost: currentCost,
      traits,
      manaStart: ability.manaStart,
      manaMax: ability.manaMax,
      ability: {
        name: ability.name,
        description
      }
    });
  }

  if (records.size === 0) {
    warnings.push('Out of Games champion guide was fetched but no champion records were parsed.');
  }

  return records;
}

function parseMobalyticsChampions(html, warnings) {
  const records = new Map();
  if (!html) {
    return records;
  }

  if (/Just a moment|Enable JavaScript and cookies|cf_chl/i.test(html)) {
    warnings.push('Mobalytics champion page could not be parsed because it returned a browser challenge.');
    return records;
  }

  warnings.push('Mobalytics champion page was fetched, but no stable preview parser matched its current markup.');
  return records;
}

function parseOutOfGamesTraits(html, warnings) {
  const records = new Map();
  if (!html) {
    return records;
  }

  const matches = Array.from(html.matchAll(/<h3 id="(?<slug>[^"]+)">(?<name>[^<]+)<\/h3>/g));
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const name = normalizePreviewText(match.groups?.name);
    if (!name) {
      continue;
    }

    const blockStart = (match.index ?? 0) + match[0].length;
    const blockEnd = matches[index + 1]?.index ?? html.length;
    const block = html.slice(blockStart, blockEnd);
    const description = normalizePreviewText(matchFirst(block, /<p>(?!<strong>Breakpoints<\/strong>)([\s\S]*?)<\/p>/));
    const breakpointBlock = matchFirst(
      block,
      /<p><strong>Breakpoints<\/strong><\/p>\s*<ul>([\s\S]*?)<\/ul>/i
    );
    const rawEffects = Array.from(
      breakpointBlock.matchAll(/<li><p><strong>\((\d+)\)<\/strong>\s*([\s\S]*?)<\/p><\/li>/g),
      (effectMatch) => ({
        minUnits: Number(effectMatch[1]),
        label: normalizePreviewText(effectMatch[2])
      })
    ).filter((effect) => Number.isFinite(effect.minUnits) && effect.minUnits > 0);
    const effects = rawEffects.map((effect, effectIndex) => ({
      ...effect,
      style: previewBreakpointStyle(effectIndex, rawEffects.length)
    }));
    const traitIndex = index + 1;
    const category = traitIndex <= 13 ? 'origin' : traitIndex <= 25 ? 'class' : 'unknown';
    const id = makeId(`TFT18_${name.replace(/\s+/g, '')}`);

    records.set(id, {
      name,
      category,
      description,
      effects
    });
  }

  if (records.size === 0) {
    warnings.push('Out of Games trait guide was fetched but no trait records were parsed.');
  }

  return records;
}

function mergeChampionEnrichment(primary, secondary) {
  const merged = new Map(primary);
  for (const [id, record] of secondary.entries()) {
    const current = merged.get(id);
    if (!current) {
      merged.set(id, record);
      continue;
    }
    merged.set(id, {
      ...current,
      ...Object.fromEntries(Object.entries(record).filter(([, value]) => value != null)),
      ability: {
        name: current.ability?.name ?? record.ability?.name ?? null,
        description: current.ability?.description ?? record.ability?.description ?? null
      }
    });
  }
  return merged;
}

function comparePreviewChampion(champion, enrichment, warnings) {
  if (!enrichment) {
    return;
  }

  if (Number.isFinite(enrichment.cost) && enrichment.cost !== champion.cost) {
    warnings.push(
      `${champion.apiName} cost mismatch: tactics.tools=${champion.cost}, Out of Games=${enrichment.cost}.`
    );
  }

  if (Array.isArray(enrichment.traits) && enrichment.traits.length > 0) {
    const tacticsTraits = new Set(champion.traits.map((trait) => normalizeTraitName(trait)));
    const missingTraits = enrichment.traits.filter((trait) => !tacticsTraits.has(normalizeTraitName(trait)));
    if (missingTraits.length > 0) {
      warnings.push(
        `${champion.apiName} trait mismatch: Out of Games also lists ${missingTraits.join(', ')}.`
      );
    }
  }
}

function validateChampionSource({ html, label, champions, warnings }) {
  if (!html || champions.length === 0) {
    return;
  }

  const text = stripHtml(html).toLowerCase();
  const sample = champions.slice(0, 20);
  const missing = sample
    .map((champion) => titleFromApi(champion.apiName))
    .filter((name) => !text.includes(name.toLowerCase()));

  if (missing.length > sample.length / 2) {
    warnings.push(`${label} did not contain most sampled tactics.tools champions.`);
  }
}

async function fetchSourceText({ id, url, sourceRecords, warnings, required = false }) {
  const sourceRecord = sourceRecords.find((source) => source.id === id);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/json',
        'User-Agent': 'TFT Trait Matrix local preview importer'
      }
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    if (sourceRecord) {
      sourceRecord.status = 'ok';
    }
    return text;
  } catch (error) {
    const message = `${id} unavailable: ${readError(error)}`;
    warnings.push(message);
    if (sourceRecord) {
      sourceRecord.status = required ? 'failed' : 'unavailable';
      sourceRecord.error = readError(error);
    }
    if (required) {
      throw new Error(message);
    }
    return '';
  }
}

function createPreviewSourceRecords() {
  return [
    {
      id: 'communityDragon',
      label: 'CommunityDragon PBE/latest',
      role: 'future canonical json',
      url: `${communityDragonRoot}/${pbeVersion}/cdragon/tft/en_us.json`,
      status: 'checked'
    },
    {
      id: 'tactics.tools',
      label: 'tactics.tools Set 18 Info',
      role: 'canonical preview roster',
      url: set18PreviewSources.tacticsTools,
      status: 'pending'
    },
    {
      id: 'mobalytics',
      label: 'Mobalytics Set 18 Champions',
      role: 'optional readable text enrichment',
      url: set18PreviewSources.mobalyticsChampions,
      status: 'pending'
    },
    {
      id: 'lolchess',
      label: 'LoLChess Set 18',
      role: 'validation',
      url: set18PreviewSources.lolchess,
      status: 'pending'
    },
    {
      id: 'outof.games champions',
      label: 'Out of Games champion guide',
      role: 'readable ability fallback',
      url: set18PreviewSources.outOfGamesChampions,
      status: 'pending'
    },
    {
      id: 'outof.games traits',
      label: 'Out of Games trait guide',
      role: 'trait breakpoint fallback',
      url: set18PreviewSources.outOfGamesTraits,
      status: 'pending'
    }
  ];
}

function listPlayableSets(sets) {
  return Object.entries(sets)
    .map(([setId, set]) => ({
      setId,
      set,
      numericId: Number.parseInt(String(set.number ?? setId).match(/\d+/)?.[0] ?? '', 10)
    }))
    .filter(({ set, numericId }) => {
      return (
        Number.isFinite(numericId) &&
        numericId > 0 &&
        numericId < 100 &&
        Array.isArray(set.champions) &&
        set.champions.length > 0 &&
        Array.isArray(set.traits) &&
        set.traits.length > 0
      );
    })
    .sort((a, b) => b.numericId - a.numericId);
}

function selectPlayableSet(sets, requestedSetId) {
  const playableSets = listPlayableSets(sets);
  if (!requestedSetId) {
    return playableSets[0];
  }

  const selectedSet = playableSets.find(({ setId }) => setId === requestedSetId);
  if (!selectedSet) {
    throw new Error(`Set ${requestedSetId} was not found for this TFT data version.`);
  }

  return selectedSet;
}

function findCompleteSet18(sets) {
  return listPlayableSets(sets).find((entry) => entry.numericId === 18 && isCompleteSet18(entry.set));
}

function hasCompleteSet18(playableSets) {
  return playableSets.some((entry) => entry.numericId === 18 && isCompleteSet18(entry.set));
}

function isCompleteSet18(set) {
  const champions = Array.isArray(set.champions) ? set.champions : [];
  const traits = Array.isArray(set.traits) ? set.traits : [];
  const hasSet18Champions = champions.some((champion) =>
    safeText(champion.apiName ?? champion.characterName ?? champion.name).startsWith('TFT18_')
  );
  const hasSet18Traits = traits.some((trait) =>
    safeText(trait.apiName ?? trait.name ?? trait.displayName).startsWith('TFT18_')
  );

  return champions.length >= 55 && traits.length >= 25 && hasSet18Champions && hasSet18Traits;
}

function normalizeRange(range) {
  const parsedRange = Number(range);
  return Number.isFinite(parsedRange) ? parsedRange : null;
}

function normalizeTraitEffects(effects) {
  if (!Array.isArray(effects)) {
    return [];
  }

  return effects
    .map((effect) => {
      const minUnits = Number(effect.minUnits);
      const maxUnits = Number(effect.maxUnits);
      const style = Number(effect.style ?? 0);

      if (!Number.isFinite(minUnits) || minUnits <= 0) {
        return null;
      }

      return {
        minUnits,
        maxUnits: Number.isFinite(maxUnits) ? maxUnits : 25000,
        style: Number.isFinite(style) ? style : 0
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.minUnits - b.minUnits);
}

function normalizePreviewTraitEffects(effects) {
  return effects
    .filter((effect) => Number.isFinite(effect.minUnits) && effect.minUnits > 0)
    .sort((a, b) => a.minUnits - b.minUnits)
    .map((effect, index, sortedEffects) => {
      const sourceStyle = Number.isFinite(effect.style)
        ? Number(effect.style)
        : previewBreakpointStyle(index, sortedEffects.length);
      const isHighCapstone = index === sortedEffects.length - 1 && effect.minUnits >= 9;
      return {
        minUnits: effect.minUnits,
        maxUnits: sortedEffects[index + 1]?.minUnits ? sortedEffects[index + 1].minUnits - 1 : 25000,
        style: isHighCapstone && sourceStyle < 6 ? 6 : sourceStyle,
        label: effect.label ?? null
      };
    });
}

function previewBreakpointStyle(index, total) {
  if (total <= 1 || index === total - 1) {
    return 4;
  }
  if (index === 0) {
    return 1;
  }
  return 3;
}

function classifyTrait(trait) {
  const sourceType = safeText(trait.category ?? trait.type ?? trait.traitType).toLowerCase();
  if (sourceType.includes('origin')) {
    return 'origin';
  }
  if (sourceType.includes('class')) {
    return 'class';
  }

  const key = normalizeTraitName(trait.name ?? trait.displayName ?? trait.apiName);
  if (originTraitNames.has(key)) {
    return 'origin';
  }
  if (classTraitNames.has(key)) {
    return 'class';
  }

  return 'unknown';
}

function toCdragonAssetUrl(assetPath, version = defaultVersion) {
  const rawPath = safeText(assetPath);
  if (!rawPath) {
    return undefined;
  }
  if (/^https?:\/\//i.test(rawPath)) {
    return rawPath;
  }

  const withoutPrefix = rawPath
    .replace(/^\/?lol-game-data\/assets\//i, '')
    .replace(/^\/+/, '')
    .toLowerCase()
    .replace(/\.tex$/i, '.png');

  return `${communityDragonRoot}/${normalizeVersion(version)}/plugins/rcp-be-lol-game-data/global/default/${withoutPrefix}`;
}

function tacticsChampionIconUrl(apiName) {
  return `https://ap.tft.tools/img/gg17/face/${safeText(apiName).toLowerCase()}.jpg?w=76`;
}

function tacticsTraitIconUrl(apiName) {
  return `https://ap.tft.tools/static/trait-icons/${safeText(apiName).toLowerCase()}_w.svg`;
}

function buildSourceUrl(version) {
  return `${communityDragonRoot}/${normalizeVersion(version)}/cdragon/tft/en_us.json`;
}

function supportsSet18Preview(version) {
  return normalizeVersion(version) === defaultVersion || normalizeVersion(version) === pbeVersion;
}

function normalizeVersion(version) {
  const safeVersion = safeText(version || defaultVersion).toLowerCase();
  if (safeVersion === defaultVersion || safeVersion === pbeVersion || /^\d+\.\d+$/.test(safeVersion)) {
    return safeVersion;
  }
  return defaultVersion;
}

function compareVersionsDesc(a, b) {
  const [majorA, minorA] = a.split('.').map(Number);
  const [majorB, minorB] = b.split('.').map(Number);
  return majorB - majorA || minorB - minorA;
}

function normalizeLookupKey(value) {
  return safeText(stripTftPrefix(value)).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeTraitName(value) {
  return normalizeLookupKey(value).replace(/^trait/, '').replace(/trait$/, '');
}

function stripTftPrefix(value) {
  return safeText(value)
    .replace(/^TFT(?:Set)?\d*_?/i, '')
    .replace(/^Set\d*_?/i, '')
    .replace(/^Trait_?/i, '');
}

function makeId(value) {
  return normalizeLookupKey(value) || 'unknown';
}

function titleFromApi(value) {
  return stripTftPrefix(value)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseMana(value) {
  const match = safeText(value).match(/(\d+)\s*\/\s*(\d+)/);
  return {
    manaStart: match ? Number(match[1]) : null,
    manaMax: match ? Number(match[2]) : null
  };
}

function parseAbilitySummary(value) {
  const text = stripHtml(value);
  const match = text.match(/^(.*?)(?:\s*[\u2013\u2014-]\s*(\d+)\s*\/\s*(\d+)\s*Mana)?$/i);
  return {
    name: normalizePreviewText(match?.[1] ?? text),
    manaStart: match?.[2] ? Number(match[2]) : null,
    manaMax: match?.[3] ? Number(match[3]) : null
  };
}

function normalizePreviewText(value) {
  const text = stripHtml(value);
  if (!text || text === '?' || /^x+$/i.test(text)) {
    return null;
  }
  if (/^TFT\d+_[A-Za-z0-9]+_(desc|ability)$/i.test(text)) {
    return null;
  }
  return text;
}

function stripHtml(value) {
  return decodeHtmlEntities(
    safeText(value)
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/p>\s*<p>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlEntities(value) {
  return safeText(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function matchFirst(value, pattern) {
  return safeText(value).match(pattern)?.[1] ?? '';
}

function safeText(value) {
  return String(value ?? '').trim();
}

function readError(error) {
  return error instanceof Error ? error.message : String(error);
}
