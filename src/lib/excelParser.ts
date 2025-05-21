
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
            const normalizedKey = String(key).toLowerCase().replace(/\s+/g, '_');
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
            entry.date = String(dateValue); // Keep as string if not a valid date
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
            detectedInputDuration = 1; // Default if no valid dates or only one date
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
  }).sort((a, b) => a.ingredient_name.localeCompare(b.ingredient_name));

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
  actualInputDuration: number = 1
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
    };
  }).sort((a, b) => a.ingredient_name.localeCompare(b.ingredient_name));

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

  const uniqueRecipeNames = Array.from(new Set(recipeDataEntries.map(e => e.type_name || 'Default Recipe'))).sort();
  const finalGroupedRecipes: GroupedRecipe[] = [];

  uniqueRecipeNames.forEach(recipeName => {
    const entriesForThisRecipe = recipeDataEntries.filter(e => (e.type_name || 'Default Recipe') === recipeName);
    if (entriesForThisRecipe.length === 0) return;

    // Overall consumer details for this recipe (from original data)
    const originalEntriesForThisRecipe = originalDietData.filter(
      e => (e.type_name || 'Default Recipe') === recipeName && typeof e.type === 'string' && e.type.toLowerCase() === 'recipe'
    );
    const overallSpeciesMap: Map<string, Set<string>> = new Map();
    const overallAnimalIdSet: Set<string> = new Set();
    const overallEnclosureSet: Set<string> = new Set();
    const overallMealTimesSet: Set<string> = new Set(); // For the card header

    originalEntriesForThisRecipe.forEach(e => {
      if (e.animal_id) overallAnimalIdSet.add(String(e.animal_id));
      if (e.common_name && e.animal_id) {
        if (!overallSpeciesMap.has(e.common_name)) overallSpeciesMap.set(e.common_name, new Set());
        overallSpeciesMap.get(e.common_name)!.add(String(e.animal_id));
      }
      if (e.user_enclosure_name) overallEnclosureSet.add(e.user_enclosure_name);
      if (e.meal_time) overallMealTimesSet.add(e.meal_time.trim());
    });

    const overall_consuming_species_details: SpeciesConsumptionDetail[] = Array.from(overallSpeciesMap.entries()).map(([name, animals]) => ({ name, animal_count: animals.size })).sort((a, b) => a.name.localeCompare(b.name));
    const overall_consuming_animal_ids = Array.from(overallAnimalIdSet).sort();
    const overall_consuming_animals_count = overallAnimalIdSet.size;
    const overall_consuming_enclosures = Array.from(overallEnclosureSet).sort();
    const overall_consuming_enclosures_count = overallEnclosureSet.size;
    const scheduled_meal_times = Array.from(overallMealTimesSet).sort(); // For card header

    // Ingredients processing (from globally filtered data)
    const aggregatedIngredients: Record<string, RecipeIngredientItem> = {};
    entriesForThisRecipe.forEach(entry => {
      const key = `${entry.ingredient_name}-${entry.preparation_type_name || 'N/A'}-${entry.cut_size_name || 'N/A'}-${entry.base_uom_name}`;
      if (!aggregatedIngredients[key]) {
        aggregatedIngredients[key] = {
          ingredient_name: entry.ingredient_name,
          preparation_type_name: entry.preparation_type_name,
          cut_size_name: entry.cut_size_name,
          base_uom_name: entry.base_uom_name,
          qty_per_day: 0, // This will be sum for recipe formulation / input duration
          qty_for_target_duration: 0, // This will be sum for recipe formulation for target duration
          parent_consuming_animals_count: overall_consuming_animals_count,
          quantities_by_meal_time: {},
          total_qty_for_target_duration_across_meal_times: 0, // Will be sum of quantities_by_meal_time
        };
      }
      // Summing raw quantities first
      const currentRawQty = (aggregatedIngredients[key] as any).raw_qty_sum || 0;
      (aggregatedIngredients[key] as any).raw_qty_sum = currentRawQty + (Number(entry.ingredient_qty) || 0);
    });

    const recipeItems: RecipeIngredientItem[] = Object.values(aggregatedIngredients).map(item => {
      const rawQtySum = (item as any).raw_qty_sum || 0;
      const qtyPerDayForRecipe = rawQtySum / (actualInputDuration || 1);
      return {
        ...item,
        qty_per_day: parseFloat(qtyPerDayForRecipe.toFixed(4)),
        qty_for_target_duration: parseFloat((qtyPerDayForRecipe * targetOutputDuration).toFixed(4)),
      };
    });

    // Determine group_specific_meal_times for the pivoted table (from original data for this recipe)
    const groupSpecificMealTimesSet = new Set<string>();
    originalEntriesForThisRecipe.forEach(e => {
        if(e.ingredient_name && recipeItems.some(ri => ri.ingredient_name === e.ingredient_name) && e.meal_time) {
            groupSpecificMealTimesSet.add(e.meal_time.trim());
        }
    });
    const group_specific_meal_times = Array.from(groupSpecificMealTimesSet).sort();

    // Populate quantities_by_meal_time for each ingredient
    recipeItems.forEach(item => {
        let totalForIngredientAcrossMeals = 0;
        group_specific_meal_times.forEach(mealTime => {
            const entriesForMeal = entriesForThisRecipe.filter(
                e => e.ingredient_name === item.ingredient_name &&
                     (e.preparation_type_name || 'N/A') === (item.preparation_type_name || 'N/A') &&
                     (e.cut_size_name || 'N/A') === (item.cut_size_name || 'N/A') &&
                     e.base_uom_name === item.base_uom_name &&
                     e.meal_time === mealTime
            );
            let sumQtyForMeal = entriesForMeal.reduce((sum, curr) => sum + (Number(curr.ingredient_qty) || 0), 0);
            const qtyPerDayForMeal = sumQtyForMeal / (actualInputDuration || 1);
            const qtyForTargetDurationForMeal = qtyPerDayForMeal * targetOutputDuration;
            item.quantities_by_meal_time[mealTime] = parseFloat(qtyForTargetDurationForMeal.toFixed(4));
            totalForIngredientAcrossMeals += qtyForTargetDurationForMeal;
        });
        item.total_qty_for_target_duration_across_meal_times = parseFloat(totalForIngredientAcrossMeals.toFixed(4));
    });
    
    // Per-meal-time consumer summaries (from original data)
    const animals_per_meal_time: Record<string, string[]> = {};
    const species_details_per_meal_time: Record<string, SpeciesConsumptionDetail[]> = {};
    const enclosures_per_meal_time: Record<string, string[]> = {};

    group_specific_meal_times.forEach(mealTime => {
      const mealTimeEntries = originalEntriesForThisRecipe.filter(e => e.meal_time === mealTime);
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

    let totalRecipeQtyPerDay = 0;
    let totalRecipeQtyForTargetDuration = 0;
    const uomCounts: Record<string, number> = {};
    recipeItems.forEach(item => {
      totalRecipeQtyPerDay += item.qty_per_day;
      totalRecipeQtyForTargetDuration += item.qty_for_target_duration;
      uomCounts[item.base_uom_name] = (uomCounts[item.base_uom_name] || 0) + 1;
    });

    let recipeUom = recipeItems.length > 0 ? recipeItems[0].base_uom_name : 'N/A';
    if (Object.keys(uomCounts).length > 1) {
      let maxCount = 0;
      for (const uom in uomCounts) {
        if (uomCounts[uom] > maxCount) { maxCount = uomCounts[uom]; recipeUom = uom; }
      }
    }

    finalGroupedRecipes.push({
      recipe_name: recipeName,
      total_qty_per_day: parseFloat(totalRecipeQtyPerDay.toFixed(4)),
      total_qty_for_target_duration: parseFloat(totalRecipeQtyForTargetDuration.toFixed(4)),
      base_uom_name: recipeUom,
      ingredients: recipeItems.sort((a, b) => a.ingredient_name.localeCompare(b.ingredient_name)),
      overall_consuming_species_details,
      overall_consuming_animals_count,
      overall_consuming_animal_ids,
      overall_consuming_enclosures,
      overall_consuming_enclosures_count,
      scheduled_meal_times,
      group_specific_meal_times,
      animals_per_meal_time,
      species_details_per_meal_time,
      enclosures_per_meal_time,
    });
  });

  return {
    data: finalGroupedRecipes.sort((a, b) => a.recipe_name.localeCompare(b.recipe_name)),
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
    new Set(comboDataEntries.map((entry) => entry.type_name || 'Default Combo Group'))
  ).sort();

  uniqueComboGroupNames.forEach((comboGroupName) => {
    const entriesForThisGroup = comboDataEntries.filter(
      (entry) => (entry.type_name || 'Default Combo Group') === comboGroupName
    );
    if (entriesForThisGroup.length === 0) return;

    // Overall consumer details for this combo group (from original data)
    const originalEntriesForThisGroup = originalDietData.filter(
      (e) => (e.type_name || 'Default Combo Group') === comboGroupName && typeof e.type === 'string' && e.type.toLowerCase() === 'combo'
    );
    const overallSpeciesMap: Map<string, Set<string>> = new Map();
    const overallAnimalIdSet: Set<string> = new Set();
    const overallEnclosureSet: Set<string> = new Set();

    originalEntriesForThisGroup.forEach(e => {
      if (e.animal_id) overallAnimalIdSet.add(String(e.animal_id));
      if (e.common_name && e.animal_id) {
        if (!overallSpeciesMap.has(e.common_name)) overallSpeciesMap.set(e.common_name, new Set());
        overallSpeciesMap.get(e.common_name)!.add(String(e.animal_id));
      }
      if (e.user_enclosure_name) overallEnclosureSet.add(e.user_enclosure_name);
    });
    const overall_consuming_species_details: SpeciesConsumptionDetail[] = Array.from(overallSpeciesMap.entries()).map(([name, animals]) => ({ name, animal_count: animals.size })).sort((a, b) => a.name.localeCompare(b.name));
    const overall_consuming_animal_ids = Array.from(overallAnimalIdSet).sort();
    const overall_consuming_animals_count = overallAnimalIdSet.size;
    const overall_consuming_enclosures = Array.from(overallEnclosureSet).sort();
    const overall_consuming_enclosures_count = overallEnclosureSet.size;

    // Determine group_specific_meal_times for the pivoted table (from original data for this group)
    const groupSpecificMealTimesSet = new Set<string>();
    originalEntriesForThisGroup.forEach(e => {
        if(e.meal_time) groupSpecificMealTimesSet.add(e.meal_time.trim());
    });
    const group_specific_meal_times = Array.from(groupSpecificMealTimesSet).sort();

    const uniqueIngredientsMap: Record<string, ComboIngredientItem> = {};
    entriesForThisGroup.forEach((entry) => { // Use entriesForThisGroup for ingredient list
      const ingKey = `${entry.ingredient_name}-${entry.preparation_type_name || 'N/A'}-${entry.cut_size_name || 'N/A'}-${entry.base_uom_name}`;
      if (!uniqueIngredientsMap[ingKey]) {
        uniqueIngredientsMap[ingKey] = {
          ingredient_name: entry.ingredient_name,
          preparation_type_name: entry.preparation_type_name,
          cut_size_name: entry.cut_size_name,
          base_uom_name: entry.base_uom_name,
          quantities_by_meal_time: {},
          total_qty_for_target_duration_across_meal_times: 0,
          parent_consuming_animals_count: overall_consuming_animals_count,
        };
      }
    });

    const ingredients: ComboIngredientItem[] = [];
    Object.values(uniqueIngredientsMap).forEach(ingredient => {
        let totalQtyForIngredientAcrossMeals = 0;
        group_specific_meal_times.forEach(mealTime => {
            const entriesForMeal = entriesForThisGroup.filter( // Filter from already filtered group entries
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

    // Per-meal-time consumer summaries (from original data for this group)
    const animals_per_meal_time: Record<string, string[]> = {};
    const species_details_per_meal_time: Record<string, SpeciesConsumptionDetail[]> = {};
    const enclosures_per_meal_time: Record<string, string[]> = {};

    group_specific_meal_times.forEach(mealTime => {
      const mealTimeEntries = originalEntriesForThisGroup.filter(e => e.meal_time === mealTime);
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

    let groupUom = ingredients.length > 0 ? ingredients[0].base_uom_name : 'N/A';
    const uomCounts: Record<string, number> = {};
    ingredients.forEach(ing => { uomCounts[ing.base_uom_name] = (uomCounts[ing.base_uom_name] || 0) + 1; });
    if (Object.keys(uomCounts).length > 1) {
      let maxCount = 0;
      for (const uom in uomCounts) {
        if (uomCounts[uom] > maxCount) { maxCount = uomCounts[uom]; groupUom = uom; }
      }
    }

    result.push({
      combo_group_name: comboGroupName,
      group_specific_meal_times: group_specific_meal_times,
      ingredients: ingredients.sort((a,b) => a.ingredient_name.localeCompare(b.ingredient_name)),
      base_uom_name: groupUom,
      overall_consuming_species_details,
      overall_consuming_animals_count,
      overall_consuming_animal_ids,
      overall_consuming_enclosures,
      overall_consuming_enclosures_count,
      animals_per_meal_time,
      species_details_per_meal_time,
      enclosures_per_meal_time,
    });
  });

  return {
    data: result.sort((a,b) => a.combo_group_name.localeCompare(b.combo_group_name)),
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

  const uniqueChoiceGroupNames = Array.from(new Set(choiceDataEntries.map(e => e.type_name || 'Default Choice Group'))).sort();
  const finalGroupedChoices: GroupedChoiceIngredient[] = [];

  uniqueChoiceGroupNames.forEach(choiceGroupName => {
    const entriesForThisGroup = choiceDataEntries.filter(e => (e.type_name || 'Default Choice Group') === choiceGroupName);
    if (entriesForThisGroup.length === 0) return;

    // Overall consumer details for this choice group (from original data)
    const originalEntriesForThisGroup = originalDietData.filter(
      e => (e.type_name || 'Default Choice Group') === choiceGroupName && typeof e.type === 'string' && e.type.toLowerCase() === 'ingredientwithchoice'
    );
    const overallSpeciesMap: Map<string, Set<string>> = new Map();
    const overallAnimalIdSet: Set<string> = new Set();
    const overallEnclosureSet: Set<string> = new Set();
    const overallMealTimesSet: Set<string> = new Set(); // For the card header

    originalEntriesForThisGroup.forEach(e => {
      if (e.animal_id) overallAnimalIdSet.add(String(e.animal_id));
      if (e.common_name && e.animal_id) {
        if (!overallSpeciesMap.has(e.common_name)) overallSpeciesMap.set(e.common_name, new Set());
        overallSpeciesMap.get(e.common_name)!.add(String(e.animal_id));
      }
      if (e.user_enclosure_name) overallEnclosureSet.add(e.user_enclosure_name);
      if (e.meal_time) overallMealTimesSet.add(e.meal_time.trim());
    });

    const overall_consuming_species_details: SpeciesConsumptionDetail[] = Array.from(overallSpeciesMap.entries()).map(([name, animals]) => ({ name, animal_count: animals.size })).sort((a, b) => a.name.localeCompare(b.name));
    const overall_consuming_animal_ids = Array.from(overallAnimalIdSet).sort();
    const overall_consuming_animals_count = overallAnimalIdSet.size;
    const overall_consuming_enclosures = Array.from(overallEnclosureSet).sort();
    const overall_consuming_enclosures_count = overallEnclosureSet.size;
    const scheduled_meal_times = Array.from(overallMealTimesSet).sort(); // For card header

    // Ingredients processing (from globally filtered data)
    const aggregatedIngredients: Record<string, ChoiceIngredientItem> = {};
    entriesForThisGroup.forEach(entry => {
      const key = `${entry.ingredient_name}-${entry.preparation_type_name || 'N/A'}-${entry.cut_size_name || 'N/A'}-${entry.base_uom_name}`;
      if (!aggregatedIngredients[key]) {
        aggregatedIngredients[key] = {
          ingredient_name: entry.ingredient_name,
          preparation_type_name: entry.preparation_type_name,
          cut_size_name: entry.cut_size_name,
          base_uom_name: entry.base_uom_name,
          qty_per_day: 0,
          qty_for_target_duration: 0,
          parent_consuming_animals_count: overall_consuming_animals_count,
          quantities_by_meal_time: {},
          total_qty_for_target_duration_across_meal_times: 0,
        };
      }
      const currentRawQty = (aggregatedIngredients[key] as any).raw_qty_sum || 0;
      (aggregatedIngredients[key] as any).raw_qty_sum = currentRawQty + (Number(entry.ingredient_qty) || 0);
    });
    
    const choiceItems: ChoiceIngredientItem[] = Object.values(aggregatedIngredients).map(item => {
        const rawQtySum = (item as any).raw_qty_sum || 0;
        const qtyPerDayForGroup = rawQtySum / (actualInputDuration || 1);
        return {
          ...item,
          qty_per_day: parseFloat(qtyPerDayForGroup.toFixed(4)),
          qty_for_target_duration: parseFloat((qtyPerDayForGroup * targetOutputDuration).toFixed(4)),
        };
    });

    // Determine group_specific_meal_times for the pivoted table (from original data for this group)
    const groupSpecificMealTimesSet = new Set<string>();
    originalEntriesForThisGroup.forEach(e => {
        if(e.ingredient_name && choiceItems.some(ci => ci.ingredient_name === e.ingredient_name) && e.meal_time) {
            groupSpecificMealTimesSet.add(e.meal_time.trim());
        }
    });
    const group_specific_meal_times = Array.from(groupSpecificMealTimesSet).sort();

    // Populate quantities_by_meal_time for each ingredient
    choiceItems.forEach(item => {
        let totalForIngredientAcrossMeals = 0;
        group_specific_meal_times.forEach(mealTime => {
            const entriesForMeal = entriesForThisGroup.filter(
                e => e.ingredient_name === item.ingredient_name &&
                     (e.preparation_type_name || 'N/A') === (item.preparation_type_name || 'N/A') &&
                     (e.cut_size_name || 'N/A') === (item.cut_size_name || 'N/A') &&
                     e.base_uom_name === item.base_uom_name &&
                     e.meal_time === mealTime
            );
            let sumQtyForMeal = entriesForMeal.reduce((sum, curr) => sum + (Number(curr.ingredient_qty) || 0), 0);
            const qtyPerDayForMeal = sumQtyForMeal / (actualInputDuration || 1);
            const qtyForTargetDurationForMeal = qtyPerDayForMeal * targetOutputDuration;
            item.quantities_by_meal_time[mealTime] = parseFloat(qtyForTargetDurationForMeal.toFixed(4));
            totalForIngredientAcrossMeals += qtyForTargetDurationForMeal;
        });
        item.total_qty_for_target_duration_across_meal_times = parseFloat(totalForIngredientAcrossMeals.toFixed(4));
    });

    // Per-meal-time consumer summaries (from original data)
    const animals_per_meal_time: Record<string, string[]> = {};
    const species_details_per_meal_time: Record<string, SpeciesConsumptionDetail[]> = {};
    const enclosures_per_meal_time: Record<string, string[]> = {};

    group_specific_meal_times.forEach(mealTime => {
      const mealTimeEntries = originalEntriesForThisGroup.filter(e => e.meal_time === mealTime);
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
    
    let totalChoiceQtyPerDay = 0;
    let totalChoiceQtyForTargetDuration = 0;
    const uomCounts: Record<string, number> = {};
    choiceItems.forEach(item => {
      totalChoiceQtyPerDay += item.qty_per_day;
      totalChoiceQtyForTargetDuration += item.qty_for_target_duration;
      uomCounts[item.base_uom_name] = (uomCounts[item.base_uom_name] || 0) + 1;
    });
    
    let choiceUom = choiceItems.length > 0 ? choiceItems[0].base_uom_name : 'N/A';
    if (Object.keys(uomCounts).length > 1) {
      let maxCount = 0;
      for (const uom in uomCounts) {
        if (uomCounts[uom] > maxCount) { maxCount = uomCounts[uom]; choiceUom = uom; }
      }
    }

    finalGroupedChoices.push({
      choice_group_name: choiceGroupName,
      total_qty_per_day: parseFloat(totalChoiceQtyPerDay.toFixed(4)),
      total_qty_for_target_duration: parseFloat(totalChoiceQtyForTargetDuration.toFixed(4)),
      base_uom_name: choiceUom,
      ingredients: choiceItems.sort((a, b) => a.ingredient_name.localeCompare(b.ingredient_name)),
      overall_consuming_species_details,
      overall_consuming_animals_count,
      overall_consuming_animal_ids,
      overall_consuming_enclosures,
      overall_consuming_enclosures_count,
      scheduled_meal_times, // Overall meal times for the group
      group_specific_meal_times, // Meal times for pivot columns
      animals_per_meal_time,
      species_details_per_meal_time,
      enclosures_per_meal_time,
    });
  });

  return {
    data: finalGroupedChoices.sort((a, b) => a.choice_group_name.localeCompare(b.choice_group_name)),
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

    