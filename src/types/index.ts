
export interface DietEntry {
  animal_id: string | number;
  label?: string;
  local_id?: string;
  wastage_qty?: number;
  scientific_name?: string;
  common_name: string; // Used for species name
  class_name?: string;
  order_name?: string;
  family_name?: string;
  genus_name?: string;
  user_enclosure_name?: string;
  section_name?: string;
  site_name: string;
  sex?: string;
  total_animal?: number;
  date: string | number | Date; // Can be Excel date number or JS Date
  diet_id?: string | number;
  diet_name?: string;
  diet_no?: string | number;
  ingredient_name: string;
  type: string; // "combo", "choice", "ingredientwithchoice" or other types
  type_name?: string; // Used for recipe name or combo name or choice group name
  meal_time?: string;
  preparation_type_name?: string;
  cut_size_name?: string;
  ingredient_qty: number;
  base_uom_name: string;
  [key: string]: any; // Allow other columns
}

export interface ParsedExcelData {
  data: DietEntry[];
  detectedInputDuration: number;
  minDate: Date | null;
  maxDate: Date | null;
}

export interface SiteIngredientsData { // Used for the "Ingredient Totals" tab
  ingredient_name: string;
  base_uom_name: string;
  qty_per_day: number;
  qty_for_target_duration: number;
}

export interface ProcessedIngredientTotalsResult {
  data: SiteIngredientsData[];
  totalAnimals: number; // Global count based on filters
  totalSpecies: number; // Global count based on filters
}

export interface DetailedRawMaterialData { // Used for "Raw Materials Required" tab
  ingredient_name: string;
  base_uom_name: string;
  qty_per_day: number;
  // qty_for_target_duration is no longer directly stored here as UI uses qty_per_day
}

export interface ProcessedDetailedRawMaterialResult {
  data: DetailedRawMaterialData[];
  totalAnimals: number;
  totalSpecies: number;
}


export interface SpeciesConsumptionDetail {
  name: string; // Species common name
  animal_count: number; // Number of unique animals of this species consuming the item
}

// For the grouped recipe display
export interface RecipeIngredientItem {
  ingredient_name: string;
  preparation_type_name?: string;
  cut_size_name?: string;
  qty_per_day: number; // Quantity normalized to 1 day (for the entire recipe formulation)
  qty_for_target_duration: number; // Quantity for the selected display duration (for the entire recipe formulation)
  base_uom_name: string;
  parent_consuming_animals_count?: number; // Animals consuming the parent recipe
  quantities_by_meal_time: Record<string, number>; // Quantity for this ingredient at a specific meal time
  total_qty_for_target_duration_across_meal_times: number; // Sum of quantities_by_meal_time
}

export interface GroupedRecipe {
  recipe_name: string;
  total_qty_per_day: number; // Total recipe quantity for 1 day
  total_qty_for_target_duration: number; // Total recipe quantity for selected display duration
  base_uom_name: string; // UOM for the total_recipe_qty
  ingredients: RecipeIngredientItem[];
  // Overall consumer details for the card header
  overall_consuming_species_details: SpeciesConsumptionDetail[];
  overall_consuming_animals_count: number;
  overall_consuming_animal_ids: string[];
  overall_consuming_enclosures: string[];
  overall_consuming_enclosures_count: number;
  scheduled_meal_times: string[]; // Unique meal times for this recipe (overall)

  // For pivoted table footer
  group_specific_meal_times: string[]; // Meal times to show as columns in pivoted table
  animals_per_meal_time: Record<string, string[]>; // meal_time -> animal_id[]
  species_details_per_meal_time: Record<string, SpeciesConsumptionDetail[]>; // meal_time -> species_detail[]
  enclosures_per_meal_time: Record<string, string[]>; // meal_time -> enclosure_name[]
}

export interface ProcessedRecipeDataResult {
  data: GroupedRecipe[];
  totalAnimals: number; // Global count based on filters
  totalSpecies: number; // Global count based on filters
}

// For Combo Ingredients Tab (Pivoted/Excel-like View)
export interface ComboIngredientItem {
  ingredient_name: string;
  preparation_type_name?: string;
  cut_size_name?: string;
  base_uom_name: string;
  quantities_by_meal_time: Record<string, number>; // Qty for this ingredient at specific meal_time for target duration
  total_qty_for_target_duration_across_meal_times: number; // Sum of quantities_by_meal_time
  parent_consuming_animals_count?: number;
}

export interface GroupedComboIngredient {
  combo_group_name: string;
  group_specific_meal_times: string[]; // Meal times to show as columns
  ingredients: ComboIngredientItem[];
  base_uom_name: string; // Overall UOM, might be the most common or first found.

  // Overall group details for the card header
  overall_consuming_species_details: SpeciesConsumptionDetail[];
  overall_consuming_animals_count: number;
  overall_consuming_animal_ids: string[];
  overall_consuming_enclosures: string[];
  overall_consuming_enclosures_count: number;

  // Per-meal-time summaries for the table footer
  animals_per_meal_time: Record<string, string[]>;
  species_details_per_meal_time: Record<string, SpeciesConsumptionDetail[]>;
  enclosures_per_meal_time: Record<string, string[]>;
}

export interface ProcessedComboIngredientsResult {
  data: GroupedComboIngredient[];
  totalAnimals: number;
  totalSpecies: number;
}


// For Choice Ingredients Tab
export interface ChoiceIngredientItem {
  ingredient_name: string;
  preparation_type_name?: string;
  cut_size_name?: string;
  qty_per_day: number; // Quantity normalized to 1 day (for the entire choice group formulation)
  qty_for_target_duration: number; // Quantity for display duration (for the entire choice group formulation)
  base_uom_name: string;
  parent_consuming_animals_count?: number; // Animals consuming the parent choice group
  quantities_by_meal_time: Record<string, number>; // Quantity for this ingredient at a specific meal time
  total_qty_for_target_duration_across_meal_times: number; // Sum of quantities_by_meal_time
}

export interface GroupedChoiceIngredient {
  choice_group_name: string;
  total_qty_per_day: number; // Total group quantity for 1 day
  total_qty_for_target_duration: number; // Total group quantity for selected display duration
  base_uom_name: string;
  ingredients: ChoiceIngredientItem[];
  // Overall consumer details for the card header
  overall_consuming_species_details: SpeciesConsumptionDetail[];
  overall_consuming_animals_count: number;
  overall_consuming_animal_ids: string[];
  overall_consuming_enclosures: string[];
  overall_consuming_enclosures_count: number;
  scheduled_meal_times: string[]; // Unique meal times for this choice group (overall)

  // For pivoted table footer
  group_specific_meal_times: string[]; // Meal times to show as columns in pivoted table
  animals_per_meal_time: Record<string, string[]>; // meal_time -> animal_id[]
  species_details_per_meal_time: Record<string, SpeciesConsumptionDetail[]>; // meal_time -> species_detail[]
  enclosures_per_meal_time: Record<string, string[]>; // meal_time -> enclosure_name[]
}

export interface ProcessedChoiceIngredientsResult {
  data: GroupedChoiceIngredient[];
  totalAnimals: number;
  totalSpecies: number;
}


export interface ColumnDefinition<T extends object> {
  key: keyof T | string;
  header: string;
  cell?: (row: T) => React.ReactNode;
}

    