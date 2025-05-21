
import * as XLSX from 'xlsx';
import type {
  DietEntry, SiteIngredientsData, ProcessedIngredientTotalsResult,
  ParsedExcelData as CustomParsedExcelData,
  RecipeIngredientItem, ProcessedRecipeDataResult, GroupedRecipe,
  ComboIngredientItem, GroupedComboIngredient, ProcessedComboIngredientsResult,
  ChoiceIngredientItem, GroupedChoiceIngredient, ProcessedChoiceIngredientsResult,
  SpeciesConsumptionDetail, DetailedRawMaterialData, ProcessedDetailedRawMaterialResult
} from '@/types';
import { differenceInCalendarDays } from 'date-fns';

export const REQUIRED_COLUMNS: (keyof DietEntry)[] = [
  'site_name',
  'ingredient_name',
  'type',
  'ingredient_qty',
  'animal_id',
  'common_name',
  'base_uom_name',
  'date',
];

export const parseExcelFile = (file: File): Promise<CustomParsedExcelData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const arrayBuffer = event.target?.result;
        if (!arrayBuffer) {
          reject(new Error("Failed to read file."));
          return;
        }
        const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<any>(worksheet, { raw: false, dateNF: 'yyyy-mm-dd' });

        const normalizedData = jsonData.map(row => {
          const newRow: DietEntry = {} as DietEntry;
          for (const key in row) {
            const normalizedKey = key.toLowerCase().replace(/\s+/g, '_');
            if (['ingredient_qty', 'wastage_qty', 'total_animal'].includes(normalizedKey)) {
              newRow[normalizedKey as keyof DietEntry] = parseFloat(String(row[key])) || 0;
            } else if (normalizedKey === 'date' && row[key]) {
                if (typeof row[key] === 'number' && row[key] > 25569) { // Excel date serial number
                    const excelDate = XLSX.SSF.parse_date_code(row[key]);
                    if (excelDate) {
                         newRow.date = new Date(Date.UTC(excelDate.y, excelDate.m - 1, excelDate.d, excelDate.H || 0, excelDate.M || 0, excelDate.S || 0));
                    } else {
                        newRow.date = String(row[key]); // Fallback if parse_date_code fails
                    }
                } else if (row[key] instanceof Date && !isNaN(row[key].getTime())) { // Already a JS Date
                    newRow.date = row[key];
                } else { // Attempt to parse as string date
                    const parsedDate = new Date(String(row[key]));
                    if (!isNaN(parsedDate.getTime())) {
                        newRow.date = parsedDate;
                    } else {
                        newRow.date = String(row[key]); // Fallback to string if all parsing fails
                    }
                }
            }
             else {
              newRow[normalizedKey as keyof DietEntry] = String(row[key] ?? '').trim();
            }
          }
          return newRow;
        });

        if (normalizedData.length === 0) {
          reject(new Error("Excel file is empty or has no data."));
          return;
        }

        const firstRow = normalizedData[0];
        const missingColumns = REQUIRED_COLUMNS.filter(colKey => {
          const val = firstRow[colKey];
          if (colKey === 'ingredient_qty') {
            return val === undefined || val === null || isNaN(parseFloat(String(val)));
          }
          return val === undefined || val === null || (typeof val === 'string' && val.trim() === '');
        });


        if (missingColumns.length > 0) {
          reject(new Error(`Missing, empty, or invalid required columns: ${missingColumns.join(', ')}. Please ensure all required columns have data and 'ingredient_qty' is numeric.`));
          return;
        }

        const validDates: Date[] = [];
        let minDateEncountered: Date | null = null;
        let maxDateEncountered: Date | null = null;

        for (const entry of normalizedData) {
          let currentDate: Date | null = null;
          const dateValue = entry.date;

          if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
            currentDate = dateValue;
          } else if (typeof dateValue === 'string') {
            const parsedDate = new Date(dateValue);
            if (!isNaN(parsedDate.getTime())) {
              currentDate = parsedDate;
            }
          }

          if (currentDate) {
            entry.date = currentDate; // Ensure date is stored as Date object if valid
            validDates.push(currentDate);
            if (!minDateEncountered || currentDate < minDateEncountered) {
              minDateEncountered = currentDate;
            }
            if (!maxDateEncountered || currentDate > maxDateEncountered) {
              maxDateEncountered = currentDate;
            }
          } else {
            // Retain original value as string if not a valid date
            entry.date = String(dateValue);
          }
        }


        let detectedInputDuration = 1;
        if (validDates.length > 0 && minDateEncountered && maxDateEncountered) {
          const dayDifference = differenceInCalendarDays(maxDateEncountered, minDateEncountered) + 1;
          if (dayDifference >= 6 && dayDifference <= 8) {
            detectedInputDuration = 7;
          } else {
            detectedInputDuration = 1;
          }
        } else {
            detectedInputDuration = 1;
        }


        resolve({
          data: normalizedData as DietEntry[],
          detectedInputDuration,
          minDate: minDateEncountered,
          maxDate: maxDateEncountered
        });

      } catch (error) {
        reject(new Error(`Error parsing Excel file: ${error instanceof Error ? error.message : String(error)}`));
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};

export const applyGlobalFilters = (
  data: DietEntry[],
  siteNamesFilter?: string[] | null,
  classNamesFilter?: string[] | null,
  speciesNamesFilter?: string[] | null,
  mealTimesFilter?: string[] | null
): DietEntry[] => {
  let filtered = data;
  if (siteNamesFilter && siteNamesFilter.length > 0) {
    filtered = filtered.filter(entry => entry.site_name && siteNamesFilter.includes(entry.site_name));
  }
  if (classNamesFilter && classNamesFilter.length > 0) {
    filtered = filtered.filter(entry => entry.class_name && classNamesFilter.includes(entry.class_name));
  }
  if (speciesNamesFilter && speciesNamesFilter.length > 0) {
    filtered = filtered.filter(entry => entry.common_name && speciesNamesFilter.includes(entry.common_name));
  }
  if (mealTimesFilter && mealTimesFilter.length > 0) {
    filtered = filtered.filter(entry => entry.meal_time && mealTimesFilter.includes(entry.meal_time));
  }
  return filtered;
};

export const getGlobalCounts = (filteredData: DietEntry[]): { totalAnimals: number; totalSpecies: number } => {
  const animalsInScope = new Set<string>();
  const speciesInScope = new Set<string>();
  filteredData.forEach(entry => {
    if (entry.animal_id) animalsInScope.add(String(entry.animal_id));
    if (entry.common_name) speciesInScope.add(entry.common_name);
  });
  return { totalAnimals: animalsInScope.size, totalSpecies: speciesInScope.size };
};


export const processOverallIngredientTotals = ( // For the simplified "Ingredient Totals" tab
  globallyFilteredData: DietEntry[],
  globalTotalAnimals: number,
  globalTotalSpecies: number,
  actualInputDuration: number = 1,
  targetOutputDuration: number = 1
): ProcessedIngredientTotalsResult => {

  const ingredientsToSum = globallyFilteredData.filter(entry =>
    typeof entry.type === 'string' && entry.type.toLowerCase() !== 'ingredientwithchoice'
  );

  const grouped: Record<string, {
    raw_total_qty: number;
    ingredient_name: string;
    base_uom_name: string;
  }> = {};

  ingredientsToSum.forEach(entry => {
    const key = `${entry.ingredient_name}-${entry.base_uom_name}`; // Simplified key
    if (!grouped[key]) {
      grouped[key] = {
        ingredient_name: entry.ingredient_name,
        base_uom_name: entry.base_uom_name,
        raw_total_qty: 0,
      };
    }
    grouped[key].raw_total_qty += (Number(entry.ingredient_qty) || 0);
  });

  const resultData: SiteIngredientsData[] = Object.values(grouped).map(item => {
    const qtyPerDay = (item.raw_total_qty) / (actualInputDuration || 1);
    return {
      ingredient_name: item.ingredient_name,
      base_uom_name: item.base_uom_name,
      qty_per_day: parseFloat(qtyPerDay.toFixed(2)),
      qty_for_target_duration: parseFloat((qtyPerDay * targetOutputDuration).toFixed(2)),
    };
  });

  return {
    data: resultData,
    totalAnimals: globalTotalAnimals,
    totalSpecies: globalTotalSpecies,
  };
};

export const processDetailedRawMaterialTotals = ( // For "Raw Materials Required" tab
  globallyFilteredData: DietEntry[],
  globalTotalAnimals: number,
  globalTotalSpecies: number,
  actualInputDuration: number = 1,
  targetOutputDuration: number = 1
): ProcessedDetailedRawMaterialResult => {
  const ingredientsToSum = globallyFilteredData.filter(entry =>
    typeof entry.type === 'string' && entry.type.toLowerCase() !== 'ingredientwithchoice'
  );

  const grouped: Record<string, {
    raw_total_qty: number;
    ingredient_name: string;
    base_uom_name: string;
  }> = {};

  ingredientsToSum.forEach(entry => {
    // Group only by ingredient name and base UOM
    const key = `${entry.ingredient_name}-${entry.base_uom_name}`;
    if (!grouped[key]) {
      grouped[key] = {
        ingredient_name: entry.ingredient_name,
        base_uom_name: entry.base_uom_name,
        raw_total_qty: 0,
      };
    }
    grouped[key].raw_total_qty += (Number(entry.ingredient_qty) || 0);
  });

  const resultData: DetailedRawMaterialData[] = Object.values(grouped).map(item => {
    const qtyPerDay = item.raw_total_qty / (actualInputDuration || 1);
    return {
      ingredient_name: item.ingredient_name,
      base_uom_name: item.base_uom_name,
      qty_per_day: parseFloat(qtyPerDay.toFixed(2)),
      qty_for_target_duration: parseFloat((qtyPerDay * targetOutputDuration).toFixed(2)), // Still calculated for potential future use or consistency
    };
  });

  return {
    data: resultData,
    totalAnimals: globalTotalAnimals,
    totalSpecies: globalTotalSpecies,
  };
};


export const processRecipeData = (
  originalDietData: DietEntry[], // Used for accurate consumer mapping
  globallyFilteredData: DietEntry[], // Used for quantity calculations based on current filters
  globalTotalAnimals: number,
  globalTotalSpecies: number,
  actualInputDuration: number = 1,
  targetOutputDuration: number = 1
): ProcessedRecipeDataResult => {

  const recipeConsumerDetails: Record<string, {
    speciesMap: Map<string, Set<string>>; // species_common_name -> Set<animal_id>
    mealTimes: Set<string>;
  }> = {};

  // Determine consumers for each recipe from the original, unfiltered data
  originalDietData
    .filter(e => typeof e.type === 'string' && e.type.toLowerCase() === 'recipe' && e.type_name)
    .forEach(entry => {
      const recipeName = entry.type_name!;
      if (!recipeConsumerDetails[recipeName]) {
        recipeConsumerDetails[recipeName] = { speciesMap: new Map(), mealTimes: new Set() };
      }
      const details = recipeConsumerDetails[recipeName];
      if (entry.common_name && entry.animal_id) {
        if (!details.speciesMap.has(entry.common_name)) {
          details.speciesMap.set(entry.common_name, new Set());
        }
        details.speciesMap.get(entry.common_name)!.add(String(entry.animal_id));
      }
      if (entry.meal_time) {
        details.mealTimes.add(entry.meal_time.trim());
      }
    });

  const recipeEntries = globallyFilteredData.filter(entry =>
    typeof entry.type === 'string' && entry.type.toLowerCase() === 'recipe' && entry.type_name
  );

  const aggregatedIngredients: Record<string, { // Key: recipeName-ingredient-prep-cut-uom
    recipe_name: string;
    ingredient_name: string;
    preparation_type_name?: string;
    cut_size_name?: string;
    base_uom_name: string;
    raw_total_qty: number;
  }> = {};

  recipeEntries.forEach(entry => {
    const recipeName = entry.type_name!;
    const ingredientName = entry.ingredient_name;
    const uom = entry.base_uom_name;

    if (!ingredientName || !uom) return;

    const key = `${recipeName}-${ingredientName}-${entry.preparation_type_name || 'N/A'}-${entry.cut_size_name || 'N/A'}-${uom}`;
    if (!aggregatedIngredients[key]) {
      aggregatedIngredients[key] = {
        recipe_name: recipeName,
        ingredient_name: ingredientName,
        preparation_type_name: entry.preparation_type_name,
        cut_size_name: entry.cut_size_name,
        base_uom_name: uom,
        raw_total_qty: 0,
      };
    }
    aggregatedIngredients[key].raw_total_qty += (Number(entry.ingredient_qty) || 0);
  });

  const recipesMap: Record<string, {
    recipe_name: string;
    ingredients: RecipeIngredientItem[];
    recipe_total_qty_per_day_sum: number;
    recipe_total_qty_for_target_duration_sum: number;
    uom_counts: Record<string, number>;
    parent_consuming_animals_count: number;
    consuming_species_details: SpeciesConsumptionDetail[];
    scheduled_meal_times: string[];
  }> = {};

  Object.values(aggregatedIngredients).forEach(item => {
    const qtyPerDayForIngredient = item.raw_total_qty / (actualInputDuration || 1);
    const qtyForTargetDurationIngredient = qtyPerDayForIngredient * targetOutputDuration;
    
    const consumerInfo = recipeConsumerDetails[item.recipe_name];
    let specificRecipeAnimalCount = 0;
    let currentSpeciesDetails: SpeciesConsumptionDetail[] = [];
    let currentScheduledMealTimes: string[] = [];

    if (consumerInfo) {
        const uniqueAnimalsForRecipe = new Set<string>();
        consumerInfo.speciesMap.forEach(animalSet => {
            animalSet.forEach(animalId => uniqueAnimalsForRecipe.add(animalId));
        });
        specificRecipeAnimalCount = uniqueAnimalsForRecipe.size;
        currentSpeciesDetails = Array.from(consumerInfo.speciesMap.entries()).map(([speciesName, animalSet]) => ({
          name: speciesName, animal_count: animalSet.size
        })).sort((a, b) => a.name.localeCompare(b.name));
        currentScheduledMealTimes = Array.from(consumerInfo.mealTimes).sort();
    }

    if (!recipesMap[item.recipe_name]) {
      recipesMap[item.recipe_name] = {
        recipe_name: item.recipe_name,
        ingredients: [],
        recipe_total_qty_per_day_sum: 0,
        recipe_total_qty_for_target_duration_sum: 0,
        uom_counts: {},
        parent_consuming_animals_count: specificRecipeAnimalCount,
        consuming_species_details: currentSpeciesDetails,
        scheduled_meal_times: currentScheduledMealTimes,
      };
    }

    recipesMap[item.recipe_name].ingredients.push({
      ingredient_name: item.ingredient_name,
      preparation_type_name: item.preparation_type_name,
      cut_size_name: item.cut_size_name,
      qty_per_day: parseFloat(qtyPerDayForIngredient.toFixed(4)),
      qty_for_target_duration: parseFloat(qtyForTargetDurationIngredient.toFixed(4)),
      base_uom_name: item.base_uom_name,
      parent_consuming_animals_count: specificRecipeAnimalCount,
    });
    recipesMap[item.recipe_name].recipe_total_qty_per_day_sum += qtyPerDayForIngredient;
    recipesMap[item.recipe_name].recipe_total_qty_for_target_duration_sum += qtyForTargetDurationIngredient;
    recipesMap[item.recipe_name].uom_counts[item.base_uom_name] = (recipesMap[item.recipe_name].uom_counts[item.base_uom_name] || 0) + 1;
  });

  const finalGroupedRecipes: GroupedRecipe[] = Object.values(recipesMap).map(recipe => {
    let recipeUom = recipe.ingredients.length > 0 ? recipe.ingredients[0].base_uom_name : 'N/A';
    if (Object.keys(recipe.uom_counts).length > 1) {
      let maxCount = 0;
      for (const uom in recipe.uom_counts) {
        if (recipe.uom_counts[uom] > maxCount) {
          maxCount = recipe.uom_counts[uom];
          recipeUom = uom;
        }
      }
    }
    const consumerInfo = recipeConsumerDetails[recipe.recipe_name];
    const species_list_for_modal = consumerInfo ? Array.from(consumerInfo.speciesMap.keys()).sort() : [];

    return {
      recipe_name: recipe.recipe_name,
      total_qty_per_day: parseFloat(recipe.recipe_total_qty_per_day_sum.toFixed(4)),
      total_qty_for_target_duration: parseFloat(recipe.recipe_total_qty_for_target_duration_sum.toFixed(4)),
      base_uom_name: recipeUom,
      ingredients: recipe.ingredients,
      consuming_species: species_list_for_modal,
      consuming_animals_count: recipe.parent_consuming_animals_count,
      consuming_species_details: recipe.consuming_species_details,
      scheduled_meal_times: recipe.scheduled_meal_times,
    };
  });

  return {
    data: finalGroupedRecipes,
    totalAnimals: globalTotalAnimals,
    totalSpecies: globalTotalSpecies,
  };
};

export const processComboIngredientUsage = (
  originalDietData: DietEntry[],
  globallyFilteredData: DietEntry[],
  globalTotalAnimals: number,
  globalTotalSpecies: number,
  actualInputDuration: number = 1,
  targetOutputDuration: number = 1
): ProcessedComboIngredientsResult => {

  const comboConsumerDetails: Record<string, {
    speciesMap: Map<string, Set<string>>;
    mealTimes: Set<string>;
  }> = {};

  originalDietData
    .filter(e => typeof e.type === 'string' && e.type.toLowerCase() === 'combo')
    .forEach(entry => {
      const groupName = entry.type_name || 'Default Combo Group';
      if (!comboConsumerDetails[groupName]) {
        comboConsumerDetails[groupName] = { speciesMap: new Map(), mealTimes: new Set() };
      }
      const details = comboConsumerDetails[groupName];
      if (entry.common_name && entry.animal_id) {
        if (!details.speciesMap.has(entry.common_name)) {
          details.speciesMap.set(entry.common_name, new Set());
        }
        details.speciesMap.get(entry.common_name)!.add(String(entry.animal_id));
      }
      if (entry.meal_time) {
        details.mealTimes.add(entry.meal_time.trim());
      }
    });

  const comboDataEntries = globallyFilteredData.filter(entry =>
    typeof entry.type === 'string' && entry.type.toLowerCase() === 'combo'
  );

  const aggregatedIngredients: Record<string, {
    combo_group_name: string;
    ingredient_name: string;
    preparation_type_name?: string;
    cut_size_name?: string;
    base_uom_name: string;
    raw_total_qty: number;
  }> = {};

  comboDataEntries.forEach(entry => {
    const comboGroupName = entry.type_name || 'Default Combo Group';
    const ingredientName = entry.ingredient_name;
    const uom = entry.base_uom_name;

    if (!ingredientName || !uom) return;

    const key = `${comboGroupName}-${ingredientName}-${entry.preparation_type_name || 'N/A'}-${entry.cut_size_name || 'N/A'}-${uom}`;
    if (!aggregatedIngredients[key]) {
      aggregatedIngredients[key] = {
        combo_group_name: comboGroupName,
        ingredient_name: ingredientName,
        preparation_type_name: entry.preparation_type_name,
        cut_size_name: entry.cut_size_name,
        base_uom_name: uom,
        raw_total_qty: 0,
      };
    }
    aggregatedIngredients[key].raw_total_qty += (Number(entry.ingredient_qty) || 0);
  });

  const comboGroupsMap: Record<string, {
    combo_group_name: string;
    ingredients: ComboIngredientItem[];
    group_total_qty_per_day_sum: number;
    group_total_qty_for_target_duration_sum: number;
    uom_counts: Record<string, number>;
    parent_consuming_animals_count: number;
    consuming_species_details: SpeciesConsumptionDetail[];
    scheduled_meal_times: string[];
  }> = {};

  Object.values(aggregatedIngredients).forEach(item => {
    const qtyPerDayForIngredient = item.raw_total_qty / (actualInputDuration || 1);
    const qtyForTargetDurationIngredient = qtyPerDayForIngredient * targetOutputDuration;
    
    const consumerInfo = comboConsumerDetails[item.combo_group_name];
    let specificGroupAnimalCount = 0;
    let currentSpeciesDetails: SpeciesConsumptionDetail[] = [];
    let currentScheduledMealTimes: string[] = [];

     if (consumerInfo) {
        const uniqueAnimalsForGroup = new Set<string>();
        consumerInfo.speciesMap.forEach(animalSet => {
            animalSet.forEach(animalId => uniqueAnimalsForGroup.add(animalId));
        });
        specificGroupAnimalCount = uniqueAnimalsForGroup.size;
        currentSpeciesDetails = Array.from(consumerInfo.speciesMap.entries()).map(([speciesName, animalSet]) => ({
          name: speciesName, animal_count: animalSet.size
        })).sort((a, b) => a.name.localeCompare(b.name));
        currentScheduledMealTimes = Array.from(consumerInfo.mealTimes).sort();
    }

    if (!comboGroupsMap[item.combo_group_name]) {
      comboGroupsMap[item.combo_group_name] = {
        combo_group_name: item.combo_group_name,
        ingredients: [],
        group_total_qty_per_day_sum: 0,
        group_total_qty_for_target_duration_sum: 0,
        uom_counts: {},
        parent_consuming_animals_count: specificGroupAnimalCount,
        consuming_species_details: currentSpeciesDetails,
        scheduled_meal_times: currentScheduledMealTimes,
      };
    }

    comboGroupsMap[item.combo_group_name].ingredients.push({
      ingredient_name: item.ingredient_name,
      preparation_type_name: item.preparation_type_name,
      cut_size_name: item.cut_size_name,
      qty_per_day: parseFloat(qtyPerDayForIngredient.toFixed(4)),
      qty_for_target_duration: parseFloat(qtyForTargetDurationIngredient.toFixed(4)),
      base_uom_name: item.base_uom_name,
      parent_consuming_animals_count: specificGroupAnimalCount,
    });
    comboGroupsMap[item.combo_group_name].group_total_qty_per_day_sum += qtyPerDayForIngredient;
    comboGroupsMap[item.combo_group_name].group_total_qty_for_target_duration_sum += qtyForTargetDurationIngredient;
    comboGroupsMap[item.combo_group_name].uom_counts[item.base_uom_name] = (comboGroupsMap[item.combo_group_name].uom_counts[item.base_uom_name] || 0) + 1;
  });

  const finalGroupedCombos: GroupedComboIngredient[] = Object.values(comboGroupsMap).map(group => {
    let groupUom = group.ingredients.length > 0 ? group.ingredients[0].base_uom_name : 'N/A';
    if (Object.keys(group.uom_counts).length > 1) {
      let maxCount = 0;
      for (const uom in group.uom_counts) {
        if (group.uom_counts[uom] > maxCount) {
          maxCount = group.uom_counts[uom];
          groupUom = uom;
        }
      }
    }
    const consumerInfo = comboConsumerDetails[group.combo_group_name];
    const species_list_for_modal = consumerInfo ? Array.from(consumerInfo.speciesMap.keys()).sort() : [];

    return {
      combo_group_name: group.combo_group_name,
      total_qty_per_day: parseFloat(group.group_total_qty_per_day_sum.toFixed(4)),
      total_qty_for_target_duration: parseFloat(group.group_total_qty_for_target_duration_sum.toFixed(4)),
      base_uom_name: groupUom,
      ingredients: group.ingredients,
      consuming_species: species_list_for_modal,
      consuming_animals_count: group.parent_consuming_animals_count,
      consuming_species_details: group.consuming_species_details,
      scheduled_meal_times: group.scheduled_meal_times,
    };
  });

  return {
    data: finalGroupedCombos,
    totalAnimals: globalTotalAnimals,
    totalSpecies: globalTotalSpecies,
  };
};


export const processChoiceIngredientUsage = (
  originalDietData: DietEntry[],
  globallyFilteredData: DietEntry[],
  globalTotalAnimals: number,
  globalTotalSpecies: number,
  actualInputDuration: number = 1,
  targetOutputDuration: number = 1
): ProcessedChoiceIngredientsResult => {

  const choiceConsumerDetails: Record<string, {
    speciesMap: Map<string, Set<string>>;
    mealTimes: Set<string>;
  }> = {};

  originalDietData
    .filter(e => typeof e.type === 'string' && e.type.toLowerCase() === 'ingredientwithchoice')
    .forEach(entry => {
      const groupName = entry.type_name || 'Default Choice Group';
      if (!choiceConsumerDetails[groupName]) {
        choiceConsumerDetails[groupName] = { speciesMap: new Map(), mealTimes: new Set() };
      }
      const details = choiceConsumerDetails[groupName];
      if (entry.common_name && entry.animal_id) {
        if (!details.speciesMap.has(entry.common_name)) {
          details.speciesMap.set(entry.common_name, new Set());
        }
        details.speciesMap.get(entry.common_name)!.add(String(entry.animal_id));
      }
       if (entry.meal_time) {
        details.mealTimes.add(entry.meal_time.trim());
      }
    });

  const choiceDataEntries = globallyFilteredData.filter(entry =>
    typeof entry.type === 'string' && entry.type.toLowerCase() === 'ingredientwithchoice'
  );

  const aggregatedIngredients: Record<string, {
    choice_group_name: string;
    ingredient_name: string;
    preparation_type_name?: string;
    cut_size_name?: string;
    base_uom_name: string;
    raw_total_qty: number;
  }> = {};

  choiceDataEntries.forEach(entry => {
    const choiceGroupName = entry.type_name || 'Default Choice Group';
    const ingredientName = entry.ingredient_name;
    const uom = entry.base_uom_name;

    if (!ingredientName || !uom) return;

    const key = `${choiceGroupName}-${ingredientName}-${entry.preparation_type_name || 'N/A'}-${entry.cut_size_name || 'N/A'}-${uom}`;
    if (!aggregatedIngredients[key]) {
      aggregatedIngredients[key] = {
        choice_group_name: choiceGroupName,
        ingredient_name: ingredientName,
        preparation_type_name: entry.preparation_type_name,
        cut_size_name: entry.cut_size_name,
        base_uom_name: uom,
        raw_total_qty: 0,
      };
    }
    aggregatedIngredients[key].raw_total_qty += (Number(entry.ingredient_qty) || 0);
  });

  const choiceGroupsMap: Record<string, {
    choice_group_name: string;
    ingredients: ChoiceIngredientItem[];
    group_total_qty_per_day_sum: number;
    group_total_qty_for_target_duration_sum: number;
    uom_counts: Record<string, number>;
    parent_consuming_animals_count: number;
    consuming_species_details: SpeciesConsumptionDetail[];
    scheduled_meal_times: string[];
  }> = {};

  Object.values(aggregatedIngredients).forEach(item => {
    const qtyPerDayForIngredient = item.raw_total_qty / (actualInputDuration || 1);
    const qtyForTargetDurationIngredient = qtyPerDayForIngredient * targetOutputDuration;

    const consumerInfo = choiceConsumerDetails[item.choice_group_name];
    let specificGroupAnimalCount = 0;
    let currentSpeciesDetails: SpeciesConsumptionDetail[] = [];
    let currentScheduledMealTimes: string[] = [];

    if (consumerInfo) {
        const uniqueAnimalsForGroup = new Set<string>();
        consumerInfo.speciesMap.forEach(animalSet => {
            animalSet.forEach(animalId => uniqueAnimalsForGroup.add(animalId));
        });
        specificGroupAnimalCount = uniqueAnimalsForGroup.size;
        currentSpeciesDetails = Array.from(consumerInfo.speciesMap.entries()).map(([speciesName, animalSet]) => ({
          name: speciesName, animal_count: animalSet.size
        })).sort((a, b) => a.name.localeCompare(b.name));
        currentScheduledMealTimes = Array.from(consumerInfo.mealTimes).sort();
    }


    if (!choiceGroupsMap[item.choice_group_name]) {
      choiceGroupsMap[item.choice_group_name] = {
        choice_group_name: item.choice_group_name,
        ingredients: [],
        group_total_qty_per_day_sum: 0,
        group_total_qty_for_target_duration_sum: 0,
        uom_counts: {},
        parent_consuming_animals_count: specificGroupAnimalCount,
        consuming_species_details: currentSpeciesDetails,
        scheduled_meal_times: currentScheduledMealTimes,
      };
    }

    choiceGroupsMap[item.choice_group_name].ingredients.push({
      ingredient_name: item.ingredient_name,
      preparation_type_name: item.preparation_type_name,
      cut_size_name: item.cut_size_name,
      qty_per_day: parseFloat(qtyPerDayForIngredient.toFixed(4)),
      qty_for_target_duration: parseFloat(qtyForTargetDurationIngredient.toFixed(4)),
      base_uom_name: item.base_uom_name,
      parent_consuming_animals_count: specificGroupAnimalCount,
    });
    choiceGroupsMap[item.choice_group_name].group_total_qty_per_day_sum += qtyPerDayForIngredient;
    choiceGroupsMap[item.choice_group_name].group_total_qty_for_target_duration_sum += qtyForTargetDurationIngredient;
    choiceGroupsMap[item.choice_group_name].uom_counts[item.base_uom_name] = (choiceGroupsMap[item.choice_group_name].uom_counts[item.base_uom_name] || 0) + 1;
  });

  const finalGroupedChoices: GroupedChoiceIngredient[] = Object.values(choiceGroupsMap).map(group => {
    let groupUom = group.ingredients.length > 0 ? group.ingredients[0].base_uom_name : 'N/A';
    if (Object.keys(group.uom_counts).length > 1) {
      let maxCount = 0;
      for (const uom in group.uom_counts) {
        if (group.uom_counts[uom] > maxCount) {
          maxCount = group.uom_counts[uom];
          groupUom = uom;
        }
      }
    }
    
    const consumerInfo = choiceConsumerDetails[group.choice_group_name];
    const species_list_for_modal = consumerInfo ? Array.from(consumerInfo.speciesMap.keys()).sort() : [];


    return {
      choice_group_name: group.choice_group_name,
      total_qty_per_day: parseFloat(group.group_total_qty_per_day_sum.toFixed(4)),
      total_qty_for_target_duration: parseFloat(group.group_total_qty_for_target_duration_sum.toFixed(4)),
      base_uom_name: groupUom,
      ingredients: group.ingredients,
      consuming_species: species_list_for_modal,
      consuming_animals_count: group.parent_consuming_animals_count,
      consuming_species_details: group.consuming_species_details,
      scheduled_meal_times: group.scheduled_meal_times,
    };
  });

  return {
    data: finalGroupedChoices,
    totalAnimals: globalTotalAnimals,
    totalSpecies: globalTotalSpecies,
  };
};


export const getUniqueSiteNames = (data: DietEntry[]): string[] => {
  if (!data) return [];
  const siteNames = new Set(data.map(entry => entry.site_name).filter(Boolean) as string[]);
  return Array.from(siteNames).sort();
};

export const getUniqueSpeciesNames = (data: DietEntry[]): string[] => {
  if (!data) return [];
  const speciesNames = new Set(data.map(entry => entry.common_name).filter(Boolean) as string[]);
  return Array.from(speciesNames).sort();
};

export const getUniqueClassNames = (data: DietEntry[]): string[] => {
  if (!data) return [];
  const classNames = new Set(data.map(entry => entry.class_name).filter(Boolean) as string[]);
  return Array.from(classNames).sort();
};

export const getUniqueMealTimes = (data: DietEntry[]): string[] => {
  if (!data) return [];
  const mealTimes = new Set(data.map(entry => entry.meal_time).filter(Boolean) as string[]);
  return Array.from(mealTimes).sort();
};

