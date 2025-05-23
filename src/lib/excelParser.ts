
import * as XLSX from 'xlsx';
import type {
  DietEntry,
  SiteIngredientsData, ProcessedIngredientTotalsResult, GroupedByTypeIngredient,
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

// Renamed from parseMealTime to parseSingleTimeToMinutes
function parseSingleTimeToMinutes(timeStr: string): number | null {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const normalizedTimeStr = String(timeStr).toUpperCase().replace(/\s+/g, '');

  let match = normalizedTimeStr.match(/^(\d{1,2}):(\d{2})(AM|PM)$/);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const period = match[3];
    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return null;
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0; // Midnight
    return hours * 60 + minutes;
  }

  match = normalizedTimeStr.match(/^(\d{1,2}):(\d{2})(:(\d{2}))?$/); // 24-hour format
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
  }
  return null;
}

// New function to parse time ranges like "HH:MM - HH:MM"
export function parseMealTimeRange(rangeStr: string): { startMinutes: number; endMinutes: number } | null {
  if (!rangeStr || typeof rangeStr !== 'string') return null;
  // Use regex to split by hyphen, allowing for optional spaces around it
  const parts = rangeStr.split(/\s*-\s*/).map(part => part.trim());

  if (parts.length === 2) {
    const startMinutes = parseSingleTimeToMinutes(parts[0]);
    const endMinutes = parseSingleTimeToMinutes(parts[1]);
    if (startMinutes !== null && endMinutes !== null) {
      return { startMinutes, endMinutes };
    }
  } else if (parts.length === 1 && parts[0] !== '') { // Handle single time entries
    const singleTimeMinutes = parseSingleTimeToMinutes(parts[0]);
    if (singleTimeMinutes !== null) {
      return { startMinutes: singleTimeMinutes, endMinutes: singleTimeMinutes }; // Point in time
    }
  }
  return null;
}


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
            const normalizedKey = String(key).toLowerCase().replace(/\s+/g, '_').replace(/[\r\n\t]/g, '');
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
  sectionNamesFilter?: string[] | null,
  enclosureNamesFilter?: string[] | null,
  classNamesFilter?: string[] | null,
  speciesNamesFilter?: string[] | null,
  timeSegmentFilter?: { startMinutes: number; endMinutes: number } | null
): DietEntry[] => {
  if (!data) return [];
  let filtered = data;

  if (siteNamesFilter && siteNamesFilter.length > 0) {
    filtered = filtered.filter(entry => entry.site_name && siteNamesFilter.includes(entry.site_name));
  }
  if (sectionNamesFilter && sectionNamesFilter.length > 0) {
    filtered = filtered.filter(entry => entry.section_name && sectionNamesFilter.includes(entry.section_name));
  }
  if (enclosureNamesFilter && enclosureNamesFilter.length > 0) {
    filtered = filtered.filter(entry => entry.user_enclosure_name && enclosureNamesFilter.includes(entry.user_enclosure_name));
  }
  if (classNamesFilter && classNamesFilter.length > 0) {
    filtered = filtered.filter(entry => entry.class_name && classNamesFilter.includes(entry.class_name));
  }
  if (speciesNamesFilter && speciesNamesFilter.length > 0) {
    filtered = filtered.filter(entry => entry.common_name && speciesNamesFilter.includes(entry.common_name));
  }
  
  if (timeSegmentFilter) { 
      const uiStart = timeSegmentFilter.startMinutes;
      const uiEnd = timeSegmentFilter.endMinutes;

      filtered = filtered.filter(entry => {
        const excelTimeRange = parseMealTimeRange(String(entry.meal_time || ''));
        if (!excelTimeRange) {
          return false; 
        }

        const excelStart = excelTimeRange.startMinutes;
        const excelParsedEnd = excelTimeRange.endMinutes;
        
        if (excelStart <= excelParsedEnd) { 
          return excelStart <= uiEnd && uiStart <= excelParsedEnd;
        } else { 
          const overlapsLatePart = excelStart <= uiEnd && uiStart <= 1439; 
          const overlapsEarlyPart = 0 <= uiEnd && uiStart <= excelParsedEnd;   
          return overlapsLatePart || overlapsEarlyPart;
        }
      });
    }
  return filtered;
};

export const getGlobalCounts = (filteredData: DietEntry[]): { totalAnimals: number; totalSpecies: number } => {
  if (!filteredData) return { totalAnimals: 0, totalSpecies: 0 };
  const animalsInScope = new Set<string>();
  const speciesInScope = new Set<string>();
  filteredData.forEach(entry => {
    if (entry.animal_id) animalsInScope.add(String(entry.animal_id));
    if (entry.common_name) speciesInScope.add(entry.common_name);
  });
  return { totalAnimals: animalsInScope.size, totalSpecies: speciesInScope.size };
};

export const processOverallIngredientTotals = (
  originalDietData: DietEntry[],
  globallyFilteredData: DietEntry[],
  globalCounts: { totalAnimals: number; totalSpecies: number },
  actualInputDuration: number = 1,
  targetOutputDuration: number = 1
): ProcessedIngredientTotalsResult => {
  const relevantEntriesForQty = globallyFilteredData.filter(entry =>
    typeof entry.type === 'string' && !['recipe', 'combo', 'ingredientwithchoice'].includes(entry.type.toLowerCase())
  );

  const uniqueIngredientTypes = Array.from(new Set(relevantEntriesForQty.map(e => e.type || 'Unknown Type'))).sort();
  const finalGroupedData: GroupedByTypeIngredient[] = [];

  const masterMealTimeListSet = new Set<string>();
  relevantEntriesForQty.forEach(e => {
    if (e.meal_time) masterMealTimeListSet.add(String(e.meal_time).trim());
  });
  const masterMealTimeList = Array.from(masterMealTimeListSet).sort();


  uniqueIngredientTypes.forEach(typeName => {
    const entriesForThisTypeGlobal = relevantEntriesForQty.filter(e => (e.type || 'Unknown Type') === typeName);
    if (entriesForThisTypeGlobal.length === 0) return;

    const originalEntriesForThisType = originalDietData.filter(
        e => (e.type || 'Unknown Type') === typeName && 
             !['recipe', 'combo', 'ingredientwithchoice'].includes(e.type?.toLowerCase() || '')
    );

    const overallSpeciesMap: Map<string, Set<string>> = new Map(); 
    const overallAnimalIdSet: Set<string> = new Set();
    const overallEnclosureSet: Set<string> = new Set();
    const overallMealTimesForTypeSet: Set<string> = new Set(); 

    originalEntriesForThisType.forEach(e => {
        if (e.animal_id) overallAnimalIdSet.add(String(e.animal_id));
        if (e.common_name && e.animal_id) {
            if (!overallSpeciesMap.has(e.common_name)) overallSpeciesMap.set(e.common_name, new Set());
            overallSpeciesMap.get(e.common_name)!.add(String(e.animal_id));
        }
        if (e.user_enclosure_name) overallEnclosureSet.add(e.user_enclosure_name);
        if (e.meal_time) overallMealTimesForTypeSet.add(String(e.meal_time).trim());
    });
    const overall_consuming_species_details: SpeciesConsumptionDetail[] = 
        Array.from(overallSpeciesMap.entries())
             .map(([name, animals]) => ({ name, animal_count: animals.size }))
             .sort((a,b) => a.name.localeCompare(b.name));


    const ingredientsMap: Record<string, SiteIngredientsData> = {};
    entriesForThisTypeGlobal.forEach(entry => {
      const ingKey = `${entry.ingredient_name}-${entry.preparation_type_name || 'N/A'}-${entry.cut_size_name || 'N/A'}-${entry.base_uom_name}`;
      if (!ingredientsMap[ingKey]) {
        ingredientsMap[ingKey] = {
          ingredient_name: entry.ingredient_name,
          preparation_type_name: entry.preparation_type_name,
          cut_size_name: entry.cut_size_name,
          base_uom_name: entry.base_uom_name,
          quantities_by_meal_time: {},
        };
      }
    });

    const siteIngredients: SiteIngredientsData[] = Object.values(ingredientsMap).map(item => {
      masterMealTimeList.forEach(mealTime => { 
        const entriesForMeal = entriesForThisTypeGlobal.filter(
          e => e.ingredient_name === item.ingredient_name &&
               (e.preparation_type_name || 'N/A') === (item.preparation_type_name || 'N/A') &&
               (e.cut_size_name || 'N/A') === (item.cut_size_name || 'N/A') &&
               e.base_uom_name === item.base_uom_name &&
               String(e.meal_time || '').trim() === mealTime
        );
        const sumQtyForMeal = entriesForMeal.reduce((sum, curr) => sum + (Number(curr.ingredient_qty) || 0), 0);
        const qtyPerDayForMeal = sumQtyForMeal / (actualInputDuration || 1);
        item.quantities_by_meal_time[mealTime] = parseFloat((qtyPerDayForMeal * targetOutputDuration).toFixed(2));
      });
      return item;
    }).sort((a,b) => a.ingredient_name.localeCompare(b.ingredient_name));

    const animals_per_meal_time: Record<string, string[]> = {};
    const species_details_per_meal_time: Record<string, SpeciesConsumptionDetail[]> = {};
    const enclosures_per_meal_time: Record<string, string[]> = {};

    masterMealTimeList.forEach(mealTime => { 
      const mealTimeEntriesForType = originalEntriesForThisType.filter(e => String(e.meal_time || '').trim() === mealTime);
      animals_per_meal_time[mealTime] = Array.from(new Set(mealTimeEntriesForType.map(e => String(e.animal_id)).filter(Boolean))).sort();

      const speciesMapForMeal: Map<string, Set<string>> = new Map();
      mealTimeEntriesForType.forEach(e => {
        if (e.common_name && e.animal_id) {
          if (!speciesMapForMeal.has(e.common_name)) speciesMapForMeal.set(e.common_name, new Set());
          speciesMapForMeal.get(e.common_name)!.add(String(e.animal_id));
        }
      });
      species_details_per_meal_time[mealTime] = Array.from(speciesMapForMeal.entries()).map(([name, animals]) => ({ name, animal_count: animals.size })).sort((a,b) => a.name.localeCompare(b.name));
      enclosures_per_meal_time[mealTime] = Array.from(new Set(mealTimeEntriesForType.map(e => e.user_enclosure_name).filter(Boolean) as string[])).sort();
    });

    const total_quantities_for_target_duration: Record<string, number> = {};
    siteIngredients.forEach(ing => {
      Object.values(ing.quantities_by_meal_time).forEach(qty => {
        total_quantities_for_target_duration[ing.base_uom_name] = (total_quantities_for_target_duration[ing.base_uom_name] || 0) + qty;
      });
    });
     for(const uom in total_quantities_for_target_duration) {
        total_quantities_for_target_duration[uom] = parseFloat(total_quantities_for_target_duration[uom].toFixed(2));
    }

    finalGroupedData.push({
      ingredient_type_name: typeName,
      total_quantities_for_target_duration,
      overall_consuming_species_details,
      overall_consuming_animals_count: overallAnimalIdSet.size,
      overall_consuming_animal_ids: Array.from(overallAnimalIdSet).sort(),
      overall_consuming_enclosures: Array.from(overallEnclosureSet).sort(),
      overall_consuming_enclosures_count: overallEnclosureSet.size,
      scheduled_meal_times: Array.from(overallMealTimesForTypeSet).sort(),
      ingredients: siteIngredients,
      group_specific_meal_times: masterMealTimeList, 
      animals_per_meal_time,
      species_details_per_meal_time,
      enclosures_per_meal_time,
    });
  });

  return {
    data: finalGroupedData.sort((a,b) => a.ingredient_type_name.localeCompare(b.ingredient_type_name)),
    totalAnimals: globalCounts.totalAnimals,
    totalSpecies: globalCounts.totalSpecies,
  };
};


export const processDetailedRawMaterialTotals = (
  globallyFilteredData: DietEntry[],
  globalCounts: { totalAnimals: number; totalSpecies: number },
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
  }).sort((a, b) => a.ingredient_name.localeCompare(b.ingredient_name));

  return {
    data: resultData,
    totalAnimals: globalCounts.totalAnimals,
    totalSpecies: globalCounts.totalSpecies,
  };
};


export const processRecipeData = (
  originalDietData: DietEntry[], 
  globallyFilteredData: DietEntry[],
  globalCounts: { totalAnimals: number; totalSpecies: number },
  actualInputDuration: number = 1,
  targetOutputDuration: number = 1
): ProcessedRecipeDataResult => {
  const recipeEntriesForProcessing = globallyFilteredData.filter(entry =>
    typeof entry.type === 'string' && entry.type.toLowerCase() === 'recipe'
  );

  const uniqueRecipeNames = Array.from(new Set(recipeEntriesForProcessing.map(e => e.type_name || 'Unknown Recipe'))).sort();
  const finalGroupedRecipes: GroupedRecipe[] = [];

  uniqueRecipeNames.forEach(recipeName => {
    const entriesForThisRecipeGlobal = recipeEntriesForProcessing.filter(e => (e.type_name || 'Unknown Recipe') === recipeName);
    if (entriesForThisRecipeGlobal.length === 0) return;

    const originalEntriesForThisRecipe = originalDietData.filter(
      e => (e.type_name || 'Unknown Recipe') === recipeName && typeof e.type === 'string' && e.type.toLowerCase() === 'recipe'
    );

    const overallSpeciesMap: Map<string, Set<string>> = new Map();
    const overallAnimalIdSet: Set<string> = new Set();
    const overallEnclosureSet: Set<string> = new Set();
    const overallScheduledMealTimesSet: Set<string> = new Set();

    originalEntriesForThisRecipe.forEach(e => {
      if (e.animal_id) overallAnimalIdSet.add(String(e.animal_id));
      if (e.common_name && e.animal_id) {
        if (!overallSpeciesMap.has(e.common_name)) overallSpeciesMap.set(e.common_name, new Set());
        overallSpeciesMap.get(e.common_name)!.add(String(e.animal_id));
      }
      if (e.user_enclosure_name) overallEnclosureSet.add(e.user_enclosure_name);
      if(e.meal_time) overallScheduledMealTimesSet.add(String(e.meal_time).trim());
    });
    const overall_consuming_species_details: SpeciesConsumptionDetail[] = Array.from(overallSpeciesMap.entries()).map(([name, animals]) => ({ name, animal_count: animals.size })).sort((a, b) => a.name.localeCompare(b.name));

    const groupSpecificMealTimesSet = new Set<string>();
    originalEntriesForThisRecipe.forEach(e => { 
        if(e.meal_time) groupSpecificMealTimesSet.add(String(e.meal_time).trim());
    });
    const group_specific_meal_times = Array.from(groupSpecificMealTimesSet).sort();


    const uniqueIngredientsMap: Record<string, RecipeIngredientItem> = {};
    let recipeTotalRawQtySum = 0;

    entriesForThisRecipeGlobal.forEach(entry => { 
        const key = `${entry.ingredient_name}-${entry.preparation_type_name || 'N/A'}-${entry.cut_size_name || 'N/A'}-${entry.base_uom_name}`;
        if (!uniqueIngredientsMap[key]) {
            uniqueIngredientsMap[key] = {
                ingredient_name: entry.ingredient_name,
                preparation_type_name: entry.preparation_type_name,
                cut_size_name: entry.cut_size_name,
                base_uom_name: entry.base_uom_name,
                quantities_by_meal_time: {},
                qty_per_day: 0, 
                qty_for_target_duration: 0, 
                parent_consuming_animals_count: overallAnimalIdSet.size,
                total_qty_for_target_duration_across_meal_times: 0,
            };
        }
    });

    const recipeItems: RecipeIngredientItem[] = Object.values(uniqueIngredientsMap).map(item => {
      let itemRawTotalQtySum = 0;
      let totalForIngredientAcrossMealsForTargetDuration = 0;

      group_specific_meal_times.forEach(mealTime => {
          const entriesForMealAndIngredient = entriesForThisRecipeGlobal.filter(
              e => e.ingredient_name === item.ingredient_name &&
                   (e.preparation_type_name || 'N/A') === (item.preparation_type_name || 'N/A') &&
                   (e.cut_size_name || 'N/A') === (item.cut_size_name || 'N/A') &&
                   e.base_uom_name === item.base_uom_name &&
                   String(e.meal_time || '').trim() === mealTime
          );
          let sumQtyForMealRaw = entriesForMealAndIngredient.reduce((sum, curr) => sum + (Number(curr.ingredient_qty) || 0), 0);
          itemRawTotalQtySum += sumQtyForMealRaw; 
          
          const qtyPerDayForMeal = sumQtyForMealRaw / (actualInputDuration || 1);
          const qtyForTargetDurationForMeal = qtyPerDayForMeal * targetOutputDuration;
          item.quantities_by_meal_time[mealTime] = parseFloat(qtyForTargetDurationForMeal.toFixed(4));
          totalForIngredientAcrossMealsForTargetDuration += qtyForTargetDurationForMeal;
      });
      
      const itemQtyPerDay = itemRawTotalQtySum / (actualInputDuration || 1);
      item.qty_per_day = parseFloat(itemQtyPerDay.toFixed(4));
      item.qty_for_target_duration = parseFloat((itemQtyPerDay * targetOutputDuration).toFixed(4));
      item.total_qty_for_target_duration_across_meal_times = parseFloat(totalForIngredientAcrossMealsForTargetDuration.toFixed(4));
      
      recipeTotalRawQtySum += itemRawTotalQtySum;
      return item;
    }).sort((a,b) => a.ingredient_name.localeCompare(b.ingredient_name));

    const animals_per_meal_time: Record<string, string[]> = {};
    const species_details_per_meal_time: Record<string, SpeciesConsumptionDetail[]> = {};
    const enclosures_per_meal_time: Record<string, string[]> = {};

    group_specific_meal_times.forEach(mealTime => { 
      const mealTimeEntriesOriginal = originalEntriesForThisRecipe.filter(e => String(e.meal_time || '').trim() === mealTime);
      animals_per_meal_time[mealTime] = Array.from(new Set(mealTimeEntriesOriginal.map(e => String(e.animal_id)).filter(Boolean))).sort();

      const speciesMapForMeal: Map<string, Set<string>> = new Map();
      mealTimeEntriesOriginal.forEach(e => {
        if (e.common_name && e.animal_id) {
          if (!speciesMapForMeal.has(e.common_name)) speciesMapForMeal.set(e.common_name, new Set());
          speciesMapForMeal.get(e.common_name)!.add(String(e.animal_id));
        }
      });
      species_details_per_meal_time[mealTime] = Array.from(speciesMapForMeal.entries()).map(([name, animals]) => ({ name, animal_count: animals.size })).sort((a,b) => a.name.localeCompare(b.name));
      enclosures_per_meal_time[mealTime] = Array.from(new Set(mealTimeEntriesOriginal.map(e => e.user_enclosure_name).filter(Boolean) as string[])).sort();
    });

    const uomCounts: Record<string, number> = {};
    recipeItems.forEach(item => { uomCounts[item.base_uom_name] = (uomCounts[item.base_uom_name] || 0) + 1;});
    let recipeUom = recipeItems.length > 0 ? recipeItems[0].base_uom_name : 'N/A';
    if (Object.keys(uomCounts).length > 1) {
      let maxCount = 0;
      for (const uom in uomCounts) { if (uomCounts[uom] > maxCount) { maxCount = uomCounts[uom]; recipeUom = uom; }}
    }
    const recipeTotalQtyPerDay = recipeTotalRawQtySum / (actualInputDuration || 1);

    finalGroupedRecipes.push({
      recipe_name: recipeName,
      total_qty_per_day: parseFloat(recipeTotalQtyPerDay.toFixed(4)),
      total_qty_for_target_duration: parseFloat((recipeTotalQtyPerDay * targetOutputDuration).toFixed(4)),
      base_uom_name: recipeUom,
      ingredients: recipeItems,
      
      overall_consuming_species_details,
      overall_consuming_animals_count: overallAnimalIdSet.size,
      overall_consuming_animal_ids: Array.from(overallAnimalIdSet).sort(),
      overall_consuming_enclosures: Array.from(overallEnclosureSet).sort(),
      overall_consuming_enclosures_count: overallEnclosureSet.size,
      scheduled_meal_times: Array.from(overallScheduledMealTimesSet).sort(),
      
      group_specific_meal_times, 
      animals_per_meal_time,
      species_details_per_meal_time,
      enclosures_per_meal_time,
    });
  });

  return {
    data: finalGroupedRecipes.sort((a, b) => a.recipe_name.localeCompare(b.recipe_name)),
    totalAnimals: globalCounts.totalAnimals,
    totalSpecies: globalCounts.totalSpecies,
  };
};

export const processComboIngredientUsage = (
  originalDietData: DietEntry[],
  globallyFilteredData: DietEntry[],
  globalCounts: { totalAnimals: number; totalSpecies: number },
  actualInputDuration: number = 1,
  targetOutputDuration: number = 1
): ProcessedComboIngredientsResult => {
  const comboDataEntriesForProcessing = globallyFilteredData.filter(
    (entry) => typeof entry.type === 'string' && entry.type.toLowerCase() === 'combo'
  );

  const uniqueComboGroupNames = Array.from(
    new Set(comboDataEntriesForProcessing.map((entry) => entry.type_name || 'Default Combo Group'))
  ).sort();

  const finalGroupedCombos: GroupedComboIngredient[] = [];

  uniqueComboGroupNames.forEach((comboGroupName) => {
    const entriesForThisGroupGlobal = comboDataEntriesForProcessing.filter(
      (entry) => (entry.type_name || 'Default Combo Group') === comboGroupName
    );
     if (entriesForThisGroupGlobal.length === 0 && !originalDietData.some(e => (e.type_name || 'Default Combo Group') === comboGroupName && e.type?.toLowerCase() === 'combo') ) return;


    const originalEntriesForThisGroup = originalDietData.filter(
      (e) => (e.type_name || 'Default Combo Group') === comboGroupName && typeof e.type === 'string' && e.type.toLowerCase() === 'combo'
    );
    
    const overallSpeciesMap: Map<string, Set<string>> = new Map();
    const overallAnimalIdSet: Set<string> = new Set();
    const overallEnclosureSet: Set<string> = new Set();
    // const overallScheduledMealTimesSet: Set<string> = new Set(); // Replaced by group_specific_meal_times

    originalEntriesForThisGroup.forEach(e => {
      if (e.animal_id) overallAnimalIdSet.add(String(e.animal_id));
      if (e.common_name && e.animal_id) {
        if (!overallSpeciesMap.has(e.common_name)) overallSpeciesMap.set(e.common_name, new Set());
        overallSpeciesMap.get(e.common_name)!.add(String(e.animal_id));
      }
      if (e.user_enclosure_name) overallEnclosureSet.add(e.user_enclosure_name);
      // if(e.meal_time) overallScheduledMealTimesSet.add(String(e.meal_time).trim());
    });
    const overall_consuming_species_details: SpeciesConsumptionDetail[] = Array.from(overallSpeciesMap.entries()).map(([name, animals]) => ({ name, animal_count: animals.size })).sort((a, b) => a.name.localeCompare(b.name));

    const groupSpecificMealTimesSet = new Set<string>();
    originalEntriesForThisGroup.forEach(e => { 
        if(e.meal_time) groupSpecificMealTimesSet.add(String(e.meal_time).trim());
    });
    const group_specific_meal_times = Array.from(groupSpecificMealTimesSet).sort();

    const uniqueIngredientsMap: Record<string, ComboIngredientItem> = {};
     entriesForThisGroupGlobal.forEach((entry) => { // Use globally filtered for listing ingredients under current filter
      const ingKey = `${entry.ingredient_name}-${entry.preparation_type_name || 'N/A'}-${entry.cut_size_name || 'N/A'}-${entry.base_uom_name}`;
      if (!uniqueIngredientsMap[ingKey]) {
        uniqueIngredientsMap[ingKey] = {
          ingredient_name: entry.ingredient_name,
          preparation_type_name: entry.preparation_type_name,
          cut_size_name: entry.cut_size_name,
          base_uom_name: entry.base_uom_name,
          quantities_by_meal_time: {},
          parent_consuming_animals_count: overallAnimalIdSet.size,
          qty_per_day:0, 
          total_qty_for_target_duration_across_meal_times: 0,
        };
      }
    });

    const comboItems: ComboIngredientItem[] = Object.values(uniqueIngredientsMap).map(item => {
      let totalForIngredientAcrossMealsForTargetDuration = 0;
      let itemRawTotalQtySum = 0;
      group_specific_meal_times.forEach(mealTime => {
          const entriesForMeal = entriesForThisGroupGlobal.filter( // Use globally filtered for quantities
              e => e.ingredient_name === item.ingredient_name &&
                   (e.preparation_type_name || 'N/A') === (item.preparation_type_name || 'N/A') &&
                   (e.cut_size_name || 'N/A') === (item.cut_size_name || 'N/A') &&
                   e.base_uom_name === item.base_uom_name &&
                   String(e.meal_time || '').trim() === mealTime
          );
          let sumQtyForMealRaw = entriesForMeal.reduce((sum, curr) => sum + (Number(curr.ingredient_qty) || 0), 0);
          itemRawTotalQtySum += sumQtyForMealRaw;

          const qtyPerDayForMeal = sumQtyForMealRaw / (actualInputDuration || 1);
          const qtyForTargetDurationForMeal = qtyPerDayForMeal * targetOutputDuration;
          item.quantities_by_meal_time[mealTime] = parseFloat(qtyForTargetDurationForMeal.toFixed(4));
          totalForIngredientAcrossMealsForTargetDuration += qtyForTargetDurationForMeal;
      });
      item.qty_per_day = parseFloat((itemRawTotalQtySum / (actualInputDuration || 1)).toFixed(4)); // This is sum for THIS item
      item.total_qty_for_target_duration_across_meal_times = parseFloat(totalForIngredientAcrossMealsForTargetDuration.toFixed(4));
      return item;
    }).sort((a,b) => a.ingredient_name.localeCompare(b.ingredient_name));

    const animals_per_meal_time: Record<string, string[]> = {};
    const species_details_per_meal_time: Record<string, SpeciesConsumptionDetail[]> = {};
    const enclosures_per_meal_time: Record<string, string[]> = {};

    group_specific_meal_times.forEach(mealTime => { 
      const mealTimeEntriesOriginal = originalEntriesForThisGroup.filter(e => String(e.meal_time || '').trim() === mealTime);
      animals_per_meal_time[mealTime] = Array.from(new Set(mealTimeEntriesOriginal.map(e => String(e.animal_id)).filter(Boolean))).sort();
      const speciesMapForMeal: Map<string, Set<string>> = new Map();
      mealTimeEntriesOriginal.forEach(e => {
        if (e.common_name && e.animal_id) {
          if (!speciesMapForMeal.has(e.common_name)) speciesMapForMeal.set(e.common_name, new Set());
          speciesMapForMeal.get(e.common_name)!.add(String(e.animal_id));
        }
      });
      species_details_per_meal_time[mealTime] = Array.from(speciesMapForMeal.entries()).map(([name, animals]) => ({ name, animal_count: animals.size })).sort((a,b) => a.name.localeCompare(b.name));
      enclosures_per_meal_time[mealTime] = Array.from(new Set(mealTimeEntriesOriginal.map(e => e.user_enclosure_name).filter(Boolean) as string[])).sort();
    });

    let groupUom = comboItems.length > 0 ? comboItems[0].base_uom_name : (originalEntriesForThisGroup[0]?.base_uom_name || 'N/A');
    if (comboItems.length > 0) {
        const uomCounts: Record<string, number> = {};
        comboItems.forEach(ing => { uomCounts[ing.base_uom_name] = (uomCounts[ing.base_uom_name] || 0) + 1; });
        if (Object.keys(uomCounts).length > 1) {
          let maxCount = 0;
          for (const uom in uomCounts) {
            if (uomCounts[uom] > maxCount) { maxCount = uomCounts[uom]; groupUom = uom; }
          }
        }
    }


    finalGroupedCombos.push({
      combo_group_name: comboGroupName,
      base_uom_name: groupUom, 
      ingredients: comboItems, // These are from globallyFilteredData
      overall_consuming_species_details, // From originalEntriesForThisGroup
      overall_consuming_animals_count: overallAnimalIdSet.size, // From originalEntriesForThisGroup
      overall_consuming_animal_ids: Array.from(overallAnimalIdSet).sort(), // From originalEntriesForThisGroup
      overall_consuming_enclosures: Array.from(overallEnclosureSet).sort(), // From originalEntriesForThisGroup
      overall_consuming_enclosures_count: overallEnclosureSet.size, // From originalEntriesForThisGroup
      
      group_specific_meal_times, // From originalEntriesForThisGroup
      animals_per_meal_time, // From originalEntriesForThisGroup for specific meal_time
      species_details_per_meal_time, // From originalEntriesForThisGroup for specific meal_time
      enclosures_per_meal_time, // From originalEntriesForThisGroup for specific meal_time
    });
  });

  return {
    data: finalGroupedCombos.sort((a,b) => a.combo_group_name.localeCompare(b.combo_group_name)),
    totalAnimals: globalCounts.totalAnimals,
    totalSpecies: globalCounts.totalSpecies,
  };
};


export const processChoiceIngredientUsage = (
  originalDietData: DietEntry[],
  globallyFilteredData: DietEntry[],
  globalCounts: { totalAnimals: number; totalSpecies: number },
  actualInputDuration: number = 1,
  targetOutputDuration: number = 1
): ProcessedChoiceIngredientsResult => {
  const choiceDataEntriesForProcessing = globallyFilteredData.filter(entry =>
    typeof entry.type === 'string' && entry.type.toLowerCase() === 'ingredientwithchoice'
  );

  const uniqueChoiceGroupNames = Array.from(new Set(choiceDataEntriesForProcessing.map(e => e.type_name || 'Default Choice Group'))).sort();
  const finalGroupedChoices: GroupedChoiceIngredient[] = [];

  uniqueChoiceGroupNames.forEach(choiceGroupName => {
    const entriesForThisGroupGlobal = choiceDataEntriesForProcessing.filter(e => (e.type_name || 'Default Choice Group') === choiceGroupName);
     if (entriesForThisGroupGlobal.length === 0 && !originalDietData.some(e => (e.type_name || 'Default Choice Group') === choiceGroupName && e.type?.toLowerCase() === 'ingredientwithchoice')) return;

    const originalEntriesForThisGroup = originalDietData.filter(
      e => (e.type_name || 'Default Choice Group') === choiceGroupName && typeof e.type === 'string' && e.type.toLowerCase() === 'ingredientwithchoice'
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

    const groupSpecificMealTimesSet = new Set<string>();
    originalEntriesForThisGroup.forEach(e => {
        if(e.meal_time) groupSpecificMealTimesSet.add(String(e.meal_time).trim());
    });
    const group_specific_meal_times = Array.from(groupSpecificMealTimesSet).sort();

    const uniqueIngredientsMap: Record<string, ChoiceIngredientItem> = {};
    entriesForThisGroupGlobal.forEach(entry => {
      const key = `${entry.ingredient_name}-${entry.preparation_type_name || 'N/A'}-${entry.cut_size_name || 'N/A'}-${entry.base_uom_name}`;
      if (!uniqueIngredientsMap[key]) {
        uniqueIngredientsMap[key] = {
          ingredient_name: entry.ingredient_name,
          preparation_type_name: entry.preparation_type_name,
          cut_size_name: entry.cut_size_name,
          base_uom_name: entry.base_uom_name,
          quantities_by_meal_time: {},
          parent_consuming_animals_count: overallAnimalIdSet.size, 
          qty_per_day: 0,
          total_qty_for_target_duration_across_meal_times: 0,
        };
      }
    });

    const choiceItems: ChoiceIngredientItem[] = Object.values(uniqueIngredientsMap).map(item => {
      let totalForIngredientAcrossMealsForTargetDuration = 0;
      let itemRawTotalQtySum = 0;
      group_specific_meal_times.forEach(mealTime => {
          const entriesForMeal = entriesForThisGroupGlobal.filter(
              e => e.ingredient_name === item.ingredient_name &&
                   (e.preparation_type_name || 'N/A') === (item.preparation_type_name || 'N/A') &&
                   (e.cut_size_name || 'N/A') === (item.cut_size_name || 'N/A') &&
                   e.base_uom_name === item.base_uom_name &&
                   String(e.meal_time || '').trim() === mealTime
          );
          let sumQtyForMealRaw = entriesForMeal.reduce((sum, curr) => sum + (Number(curr.ingredient_qty) || 0), 0);
          itemRawTotalQtySum += sumQtyForMealRaw;
          
          const qtyPerDayForMeal = sumQtyForMealRaw / (actualInputDuration || 1);
          const qtyForTargetDurationForMeal = qtyPerDayForMeal * targetOutputDuration;
          item.quantities_by_meal_time[mealTime] = parseFloat(qtyForTargetDurationForMeal.toFixed(4));
          totalForIngredientAcrossMealsForTargetDuration += qtyForTargetDurationForMeal;
      });
       item.qty_per_day = parseFloat((itemRawTotalQtySum / (actualInputDuration || 1)).toFixed(4));
       item.total_qty_for_target_duration_across_meal_times = parseFloat(totalForIngredientAcrossMealsForTargetDuration.toFixed(4));
       return item;
    }).sort((a, b) => a.ingredient_name.localeCompare(b.ingredient_name));

    const animals_per_meal_time: Record<string, string[]> = {};
    const species_details_per_meal_time: Record<string, SpeciesConsumptionDetail[]> = {};
    const enclosures_per_meal_time: Record<string, string[]> = {};

    group_specific_meal_times.forEach(mealTime => { 
      const mealTimeEntriesOriginal = originalEntriesForThisGroup.filter(e => String(e.meal_time || '').trim() === mealTime);
      animals_per_meal_time[mealTime] = Array.from(new Set(mealTimeEntriesOriginal.map(e => String(e.animal_id)).filter(Boolean))).sort();
      const speciesMapForMeal: Map<string, Set<string>> = new Map();
      mealTimeEntriesOriginal.forEach(e => {
        if (e.common_name && e.animal_id) {
          if (!speciesMapForMeal.has(e.common_name)) speciesMapForMeal.set(e.common_name, new Set());
          speciesMapForMeal.get(e.common_name)!.add(String(e.animal_id));
        }
      });
      species_details_per_meal_time[mealTime] = Array.from(speciesMapForMeal.entries()).map(([name, animals]) => ({ name, animal_count: animals.size })).sort((a,b) => a.name.localeCompare(b.name));
      enclosures_per_meal_time[mealTime] = Array.from(new Set(mealTimeEntriesOriginal.map(e => e.user_enclosure_name).filter(Boolean) as string[])).sort();
    });

    let choiceUom = choiceItems.length > 0 ? choiceItems[0].base_uom_name : (originalEntriesForThisGroup[0]?.base_uom_name || 'N/A');
     if (choiceItems.length > 0) {
        const uomCounts: Record<string, number> = {};
        choiceItems.forEach(item => {
          uomCounts[item.base_uom_name] = (uomCounts[item.base_uom_name] || 0) + 1;
        });
        if (Object.keys(uomCounts).length > 1) {
          let maxCount = 0;
          for (const uom in uomCounts) {
            if (uomCounts[uom] > maxCount) { maxCount = uomCounts[uom]; choiceUom = uom; }
          }
        }
    }


    finalGroupedChoices.push({
      choice_group_name: choiceGroupName,
      base_uom_name: choiceUom, 
      ingredients: choiceItems,
      overall_consuming_species_details,
      overall_consuming_animals_count: overallAnimalIdSet.size,
      overall_consuming_animal_ids: Array.from(overallAnimalIdSet).sort(),
      overall_consuming_enclosures: Array.from(overallEnclosureSet).sort(),
      overall_consuming_enclosures_count: overallEnclosureSet.size,
      scheduled_meal_times: group_specific_meal_times, // Use group_specific_meal_times for the header
      group_specific_meal_times,
      animals_per_meal_time,
      species_details_per_meal_time,
      enclosures_per_meal_time,
    });
  });

  return {
    data: finalGroupedChoices.sort((a, b) => a.choice_group_name.localeCompare(b.choice_group_name)),
    totalAnimals: globalCounts.totalAnimals,
    totalSpecies: globalCounts.totalSpecies,
  };
};


export const getUniqueSiteNames = (data: DietEntry[]): string[] => {
  if (!data) return [];
  const siteNames = new Set(data.map(entry => entry.site_name).filter(Boolean) as string[]);
  return Array.from(siteNames).sort();
};
export const getUniqueSectionNames = (data: DietEntry[]): string[] => {
  if (!data) return [];
  const sectionNames = new Set(data.map(entry => entry.section_name).filter(Boolean) as string[]);
  return Array.from(sectionNames).sort();
};

export const getUniqueEnclosureNames = (data: DietEntry[]): string[] => {
  if (!data) return [];
  const enclosureNames = new Set(data.map(entry => entry.user_enclosure_name).filter(Boolean) as string[]);
  return Array.from(enclosureNames).sort();
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


export const getDynamicUniqueFilterOptions = (
  originalData: DietEntry[],
  targetKey: keyof DietEntry,
  currentFilters: {
    siteNames: string[];
    sectionNames: string[];
    enclosureNames: string[];
    classNames: string[];
    speciesNames: string[];
    timeSegment: { startMinutes: number; endMinutes: number } | null; 
  }
): string[] => {
  if (!originalData || originalData.length === 0) return [];

  let filteredData = originalData;

  if (targetKey !== 'site_name' && currentFilters.siteNames.length > 0) {
    filteredData = filteredData.filter(e => e.site_name && currentFilters.siteNames.includes(e.site_name));
  }
  if (targetKey !== 'section_name' && currentFilters.sectionNames.length > 0) {
    filteredData = filteredData.filter(e => e.section_name && currentFilters.sectionNames.includes(e.section_name));
  }
  if (targetKey !== 'user_enclosure_name' && currentFilters.enclosureNames.length > 0) {
    filteredData = filteredData.filter(e => e.user_enclosure_name && currentFilters.enclosureNames.includes(e.user_enclosure_name));
  }
  if (targetKey !== 'class_name' && currentFilters.classNames.length > 0) {
    filteredData = filteredData.filter(e => e.class_name && currentFilters.classNames.includes(e.class_name));
  }
  if (targetKey !== 'common_name' && currentFilters.speciesNames.length > 0) {
    filteredData = filteredData.filter(e => e.common_name && currentFilters.speciesNames.includes(e.common_name));
  }
  
  if (currentFilters.timeSegment) {
      const uiStart = currentFilters.timeSegment.startMinutes;
      const uiEnd = currentFilters.timeSegment.endMinutes;
      filteredData = filteredData.filter(entry => {
          const excelTimeRange = parseMealTimeRange(String(entry.meal_time || ''));
          if (!excelTimeRange) return false;
          
          const excelStart = excelTimeRange.startMinutes;
          const excelParsedEnd = excelTimeRange.endMinutes;

          if (excelStart <= excelParsedEnd) { 
            return excelStart <= uiEnd && uiStart <= excelParsedEnd;
          } else { 
            const overlapsLatePart = excelStart <= uiEnd && uiStart <= 1439;
            const overlapsEarlyPart = 0 <= uiEnd && uiStart <= excelParsedEnd;
            return overlapsLatePart || overlapsEarlyPart;
          }
      });
  }
  return Array.from(new Set(filteredData.map(entry => entry[targetKey]).filter(Boolean) as string[])).sort();
};
    

    
