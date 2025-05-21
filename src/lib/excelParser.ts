
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
                if (typeof row[key] === 'number' && row[key] > 25569) { 
                    const excelDate = XLSX.SSF.parse_date_code(row[key]);
                    if (excelDate) {
                         newRow.date = new Date(Date.UTC(excelDate.y, excelDate.m - 1, excelDate.d, excelDate.H || 0, excelDate.M || 0, excelDate.S || 0));
                    } else {
                        newRow.date = String(row[key]);
                    }
                } else if (row[key] instanceof Date && !isNaN(row[key].getTime())) { 
                    newRow.date = row[key];
                } else { 
                    const parsedDate = new Date(String(row[key]));
                    if (!isNaN(parsedDate.getTime())) {
                        newRow.date = parsedDate;
                    } else {
                        newRow.date = String(row[key]);
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
            entry.date = currentDate; 
            validDates.push(currentDate);
            if (!minDateEncountered || currentDate < minDateEncountered) {
              minDateEncountered = currentDate;
            }
            if (!maxDateEncountered || currentDate > maxDateEncountered) {
              maxDateEncountered = currentDate;
            }
          } else {
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


export const processOverallIngredientTotals = (
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

export const processDetailedRawMaterialTotals = (
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
      qty_for_target_duration: parseFloat((qtyPerDay * targetOutputDuration).toFixed(2)),
    };
  });

  return {
    data: resultData,
    totalAnimals: globalTotalAnimals,
    totalSpecies: globalTotalSpecies,
  };
};


export const processRecipeData = (
  originalDietData: DietEntry[], 
  globallyFilteredData: DietEntry[],
  globalTotalAnimals: number,
  globalTotalSpecies: number,
  actualInputDuration: number = 1,
  targetOutputDuration: number = 1
): ProcessedRecipeDataResult => {

  const recipeDataEntries = globallyFilteredData.filter(entry =>
    typeof entry.type === 'string' && entry.type.toLowerCase() === 'recipe'
  );

  const aggregatedIngredients: Record<string, { 
    recipe_name: string;
    ingredient_name: string;
    preparation_type_name?: string;
    cut_size_name?: string;
    base_uom_name: string;
    raw_total_qty: number;
  }> = {};

  recipeDataEntries.forEach(entry => {
    const recipeName = entry.type_name || 'Default Recipe';
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

  const recipesMap: Record<string, GroupedRecipe> = {};

  Object.values(aggregatedIngredients).forEach(item => {
    
    // Consumer details for this specific recipe
    const recipeSpecificEntries = originalDietData.filter(
      e => (e.type_name || 'Default Recipe') === item.recipe_name && typeof e.type === 'string' && e.type.toLowerCase() === 'recipe'
    );
    const speciesMap: Map<string, Set<string>> = new Map();
    const animalIdSet: Set<string> = new Set();
    const enclosureSet: Set<string> = new Set();
    const mealTimesSet: Set<string> = new Set();

    recipeSpecificEntries.forEach(e => {
      if (e.animal_id) animalIdSet.add(String(e.animal_id));
      if (e.common_name && e.animal_id) {
        if (!speciesMap.has(e.common_name)) speciesMap.set(e.common_name, new Set());
        speciesMap.get(e.common_name)!.add(String(e.animal_id));
      }
      if (e.user_enclosure_name) enclosureSet.add(e.user_enclosure_name);
      if (e.meal_time) mealTimesSet.add(e.meal_time.trim());
    });
    
    const currentSpeciesDetails: SpeciesConsumptionDetail[] = Array.from(speciesMap.entries()).map(([name, animals]) => ({ name, animal_count: animals.size })).sort((a,b) => a.name.localeCompare(b.name));
    const currentAnimalIds = Array.from(animalIdSet).sort();
    const currentAnimalCount = animalIdSet.size;
    const currentEnclosures = Array.from(enclosureSet).sort();
    const currentEnclosureCount = enclosureSet.size;
    const currentScheduledMealTimes = Array.from(mealTimesSet).sort();


    if (!recipesMap[item.recipe_name]) {
      recipesMap[item.recipe_name] = {
        recipe_name: item.recipe_name,
        ingredients: [],
        total_qty_per_day: 0,
        total_qty_for_target_duration: 0,
        base_uom_name: '', 
        consuming_species_details: currentSpeciesDetails,
        consuming_animals_count: currentAnimalCount,
        consuming_animal_ids: currentAnimalIds,
        consuming_enclosures: currentEnclosures,
        consuming_enclosures_count: currentEnclosureCount,
        scheduled_meal_times: currentScheduledMealTimes,
      };
    }

    const qtyPerDayForIngredient = item.raw_total_qty / (actualInputDuration || 1);
    const qtyForTargetDurationIngredient = qtyPerDayForIngredient * targetOutputDuration;

    recipesMap[item.recipe_name].ingredients.push({
      ingredient_name: item.ingredient_name,
      preparation_type_name: item.preparation_type_name,
      cut_size_name: item.cut_size_name,
      qty_per_day: parseFloat(qtyPerDayForIngredient.toFixed(4)),
      qty_for_target_duration: parseFloat(qtyForTargetDurationIngredient.toFixed(4)),
      base_uom_name: item.base_uom_name,
      parent_consuming_animals_count: currentAnimalCount,
    });
    recipesMap[item.recipe_name].total_qty_per_day += qtyPerDayForIngredient;
    recipesMap[item.recipe_name].total_qty_for_target_duration += qtyForTargetDurationIngredient;
  });

  const finalGroupedRecipes: GroupedRecipe[] = Object.values(recipesMap).map(recipe => {
    const uomCounts: Record<string, number> = {};
    recipe.ingredients.forEach(ing => uomCounts[ing.base_uom_name] = (uomCounts[ing.base_uom_name] || 0) + 1);
    let recipeUom = recipe.ingredients.length > 0 ? recipe.ingredients[0].base_uom_name : 'N/A';
    if (Object.keys(uomCounts).length > 1) {
      let maxCount = 0;
      for (const uom in uomCounts) {
        if (uomCounts[uom] > maxCount) { maxCount = uomCounts[uom]; recipeUom = uom; }
      }
    }
    return {
      ...recipe,
      total_qty_per_day: parseFloat(recipe.total_qty_per_day.toFixed(4)),
      total_qty_for_target_duration: parseFloat(recipe.total_qty_for_target_duration.toFixed(4)),
      base_uom_name: recipeUom,
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
  const result: GroupedComboIngredient[] = [];

  const comboDataEntries = globallyFilteredData.filter(
    (entry) => typeof entry.type === 'string' && entry.type.toLowerCase() === 'combo'
  );

  const uniqueComboGroupNames = Array.from(
    new Set(
      comboDataEntries.map((entry) => entry.type_name || 'Default Combo Group')
    )
  ).sort();

  uniqueComboGroupNames.forEach((comboGroupName) => {
    const groupEntriesForQty = comboDataEntries.filter(
      (entry) => (entry.type_name || 'Default Combo Group') === comboGroupName
    );

    const groupEntriesOriginalForConsumers = originalDietData.filter(
      (entry) =>
        typeof entry.type === 'string' &&
        entry.type.toLowerCase() === 'combo' &&
        (entry.type_name || 'Default Combo Group') === comboGroupName
    );
    
    const groupSpecificMealTimes = Array.from(new Set(groupEntriesOriginalForConsumers.map(e => e.meal_time).filter(Boolean) as string[])).sort();

    // Calculate overall consumer details for the header
    const overallSpeciesMap: Map<string, Set<string>> = new Map();
    const overallAnimalIdSet: Set<string> = new Set();
    const overallEnclosureSet: Set<string> = new Set();
    groupEntriesOriginalForConsumers.forEach(e => {
      if (e.animal_id) overallAnimalIdSet.add(String(e.animal_id));
      if (e.common_name && e.animal_id) {
        if (!overallSpeciesMap.has(e.common_name)) overallSpeciesMap.set(e.common_name, new Set());
        overallSpeciesMap.get(e.common_name)!.add(String(e.animal_id));
      }
      if (e.user_enclosure_name) overallEnclosureSet.add(e.user_enclosure_name);
    });
    const overall_consuming_species_details: SpeciesConsumptionDetail[] = Array.from(overallSpeciesMap.entries()).map(([name, animals]) => ({ name, animal_count: animals.size })).sort((a,b) => a.name.localeCompare(b.name));
    const overall_consuming_animal_ids = Array.from(overallAnimalIdSet).sort();
    const overall_consuming_animals_count = overallAnimalIdSet.size;
    const overall_consuming_enclosures = Array.from(overallEnclosureSet).sort();
    const overall_consuming_enclosures_count = overallEnclosureSet.size;


    const uniqueIngredientsMap: Record<string, ComboIngredientItem> = {};
     groupEntriesForQty.forEach((entry) => {
      const ingKey = `${entry.ingredient_name}-${entry.preparation_type_name || 'N/A'}-${entry.cut_size_name || 'N/A'}-${entry.base_uom_name}`;
      if (!uniqueIngredientsMap[ingKey]) {
        uniqueIngredientsMap[ingKey] = {
          ingredient_name: entry.ingredient_name,
          preparation_type_name: entry.preparation_type_name,
          cut_size_name: entry.cut_size_name,
          base_uom_name: entry.base_uom_name,
          quantities_by_meal_time: {},
          total_qty_for_target_duration_across_meal_times: 0, // Will be summed up later
          parent_consuming_animals_count: 0, // This context isn't directly used here for pivoted view
        };
      }
    });
    
    const ingredients: ComboIngredientItem[] = [];
    Object.values(uniqueIngredientsMap).forEach(ingredient => {
        let totalQtyForIngredientAcrossMeals = 0;
        groupSpecificMealTimes.forEach(mealTime => {
            const entriesForMeal = groupEntriesForQty.filter(
                e => e.ingredient_name === ingredient.ingredient_name &&
                     (e.preparation_type_name || 'N/A') === (ingredient.preparation_type_name || 'N/A') &&
                     (e.cut_size_name || 'N/A') === (ingredient.cut_size_name || 'N/A') &&
                     e.base_uom_name === ingredient.base_uom_name &&
                     e.meal_time === mealTime
            );
            let sumQtyForMeal = entriesForMeal.reduce((sum, curr) => sum + (Number(curr.ingredient_qty) || 0), 0);
            const qtyPerDayForMeal = sumQtyForMeal / (actualInputDuration || 1);
            const qtyForTargetDurationForMeal = qtyPerDayForMeal * targetOutputDuration;
            
            ingredient.quantities_by_meal_time[mealTime] = parseFloat(qtyForTargetDurationForMeal.toFixed(4));
            totalQtyForIngredientAcrossMeals += qtyForTargetDurationForMeal;
        });
        ingredient.total_qty_for_target_duration_across_meal_times = parseFloat(totalQtyForIngredientAcrossMeals.toFixed(4));
        ingredients.push(ingredient);
    });


    const animals_per_meal_time: Record<string, string[]> = {};
    const species_details_per_meal_time: Record<string, SpeciesConsumptionDetail[]> = {};
    const enclosures_per_meal_time: Record<string, string[]> = {};

    groupSpecificMealTimes.forEach(mealTime => {
      const mealTimeEntries = groupEntriesOriginalForConsumers.filter(e => e.meal_time === mealTime);
      animals_per_meal_time[mealTime] = Array.from(new Set(mealTimeEntries.map(e => String(e.animal_id)).filter(Boolean))).sort();
      
      const speciesMapForMeal: Map<string, Set<string>> = new Map();
      mealTimeEntries.forEach(e => {
        if (e.common_name && e.animal_id) {
          if (!speciesMapForMeal.has(e.common_name)) speciesMapForMeal.set(e.common_name, new Set());
          speciesMapForMeal.get(e.common_name)!.add(String(e.animal_id));
        }
      });
      species_details_per_meal_time[mealTime] = Array.from(speciesMapForMeal.entries()).map(([name, animals]) => ({ name, animal_count: animals.size })).sort((a,b) => a.name.localeCompare(b.name));
      
      enclosures_per_meal_time[mealTime] = Array.from(new Set(mealTimeEntries.map(e => e.user_enclosure_name).filter(Boolean) as string[])).sort();
    });

    const uomCounts: Record<string, number> = {};
    ingredients.forEach(ing => uomCounts[ing.base_uom_name] = (uomCounts[ing.base_uom_name] || 0) + 1);
    let groupUom = ingredients.length > 0 ? ingredients[0].base_uom_name : 'N/A';
    if (Object.keys(uomCounts).length > 1) {
      let maxCount = 0;
      for (const uom in uomCounts) {
        if (uomCounts[uom] > maxCount) { maxCount = uomCounts[uom]; groupUom = uom; }
      }
    }

    result.push({
      combo_group_name: comboGroupName,
      group_specific_meal_times: groupSpecificMealTimes,
      ingredients: ingredients.sort((a,b) => a.ingredient_name.localeCompare(b.ingredient_name)),
      animals_per_meal_time,
      species_details_per_meal_time,
      enclosures_per_meal_time,
      overall_consuming_species_details,
      overall_consuming_animals_count,
      overall_consuming_animal_ids,
      overall_consuming_enclosures,
      overall_consuming_enclosures_count,
      base_uom_name: groupUom,
    });
  });

  return {
    data: result,
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

  const choiceGroupsMap: Record<string, GroupedChoiceIngredient> = {};

  Object.values(aggregatedIngredients).forEach(item => {
    const groupSpecificEntries = originalDietData.filter(
      e => (e.type_name || 'Default Choice Group') === item.choice_group_name && typeof e.type === 'string' && e.type.toLowerCase() === 'ingredientwithchoice'
    );
    const speciesMap: Map<string, Set<string>> = new Map();
    const animalIdSet: Set<string> = new Set();
    const enclosureSet: Set<string> = new Set();
    const mealTimesSet: Set<string> = new Set();

    groupSpecificEntries.forEach(e => {
      if (e.animal_id) animalIdSet.add(String(e.animal_id));
      if (e.common_name && e.animal_id) {
        if (!speciesMap.has(e.common_name)) speciesMap.set(e.common_name, new Set());
        speciesMap.get(e.common_name)!.add(String(e.animal_id));
      }
      if (e.user_enclosure_name) enclosureSet.add(e.user_enclosure_name);
      if (e.meal_time) mealTimesSet.add(e.meal_time.trim());
    });
    
    const currentSpeciesDetails: SpeciesConsumptionDetail[] = Array.from(speciesMap.entries()).map(([name, animals]) => ({ name, animal_count: animals.size })).sort((a,b) => a.name.localeCompare(b.name));
    const currentAnimalIds = Array.from(animalIdSet).sort();
    const currentAnimalCount = animalIdSet.size;
    const currentEnclosures = Array.from(enclosureSet).sort();
    const currentEnclosureCount = enclosureSet.size;
    const currentScheduledMealTimes = Array.from(mealTimesSet).sort();

    if (!choiceGroupsMap[item.choice_group_name]) {
      choiceGroupsMap[item.choice_group_name] = {
        choice_group_name: item.choice_group_name,
        ingredients: [],
        total_qty_per_day: 0,
        total_qty_for_target_duration: 0,
        base_uom_name: '', 
        consuming_species_details: currentSpeciesDetails,
        consuming_animals_count: currentAnimalCount,
        consuming_animal_ids: currentAnimalIds,
        consuming_enclosures: currentEnclosures,
        consuming_enclosures_count: currentEnclosureCount,
        scheduled_meal_times: currentScheduledMealTimes,
      };
    }

    const qtyPerDayForIngredient = item.raw_total_qty / (actualInputDuration || 1);
    const qtyForTargetDurationIngredient = qtyPerDayForIngredient * targetOutputDuration;

    choiceGroupsMap[item.choice_group_name].ingredients.push({
      ingredient_name: item.ingredient_name,
      preparation_type_name: item.preparation_type_name,
      cut_size_name: item.cut_size_name,
      qty_per_day: parseFloat(qtyPerDayForIngredient.toFixed(4)),
      qty_for_target_duration: parseFloat(qtyForTargetDurationIngredient.toFixed(4)),
      base_uom_name: item.base_uom_name,
      parent_consuming_animals_count: currentAnimalCount,
    });
    choiceGroupsMap[item.choice_group_name].total_qty_per_day += qtyPerDayForIngredient;
    choiceGroupsMap[item.choice_group_name].total_qty_for_target_duration += qtyForTargetDurationIngredient;
  });

  const finalGroupedChoices: GroupedChoiceIngredient[] = Object.values(choiceGroupsMap).map(group => {
    const uomCounts: Record<string, number> = {};
    group.ingredients.forEach(ing => uomCounts[ing.base_uom_name] = (uomCounts[ing.base_uom_name] || 0) + 1);
    let groupUom = group.ingredients.length > 0 ? group.ingredients[0].base_uom_name : 'N/A';
    if (Object.keys(uomCounts).length > 1) {
      let maxCount = 0;
      for (const uom in uomCounts) {
        if (uomCounts[uom] > maxCount) { maxCount = uomCounts[uom]; groupUom = uom; }
      }
    }
    
    return {
      ...group,
      total_qty_per_day: parseFloat(group.total_qty_per_day.toFixed(4)),
      total_qty_for_target_duration: parseFloat(group.total_qty_for_target_duration.toFixed(4)),
      base_uom_name: groupUom,
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
