
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

export interface SiteIngredientsData { // Used for the simplified "Ingredient Totals" tab
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

export interface DetailedRawMaterialData {
  ingredient_name: string;
  preparation_type_name?: string;
  cut_size_name?: string;
  base_uom_name: string;
  qty_per_day: number;
  qty_for_target_duration: number;
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
  qty_per_day: number; // Quantity normalized to 1 day
  qty_for_target_duration: number; // Quantity for the selected display duration
  base_uom_name: string;
  parent_consuming_animals_count?: number;
}

export interface GroupedRecipe {
  recipe_name: string;
  total_qty_per_day: number; // Total recipe quantity for 1 day
  total_qty_for_target_duration: number; // Total recipe quantity for selected display duration
  base_uom_name: string; // UOM for the total_recipe_qty
  ingredients: RecipeIngredientItem[];
  consuming_species: string[]; // List of unique common names of species (for modal)
  consuming_animals_count: number; // Count of unique animals consuming this recipe
  consuming_species_details: SpeciesConsumptionDetail[]; // Detailed breakdown
  scheduled_meal_times: string[]; // Unique meal times for this recipe
}

export interface ProcessedRecipeDataResult {
  data: GroupedRecipe[];
  totalAnimals: number; // Global count based on filters
  totalSpecies: number; // Global count based on filters
}

// For Combo Ingredients Tab (Grouped View)
export interface ComboIngredientItem {
  ingredient_name: string;
  preparation_type_name?: string;
  cut_size_name?: string;
  qty_per_day: number;
  qty_for_target_duration: number;
  base_uom_name: string;
  parent_consuming_animals_count?: number;
}

export interface GroupedComboIngredient {
  combo_group_name: string; // From type_name when type is 'combo'
  total_qty_per_day: number;
  total_qty_for_target_duration: number;
  base_uom_name: string;
  ingredients: ComboIngredientItem[];
  consuming_species: string[]; // List of unique common names of species (for modal)
  consuming_animals_count: number; // Count of unique animals consuming this combo group
  consuming_species_details: SpeciesConsumptionDetail[]; // Detailed breakdown
  scheduled_meal_times: string[]; // Unique meal times for this combo group
}

export interface ProcessedComboIngredientsResult {
  data: GroupedComboIngredient[];
  totalAnimals: number; // Global count based on filters
  totalSpecies: number; // Global count based on filters
}


// For Choice Ingredients Tab (Grouped View)
export interface ChoiceIngredientItem {
  ingredient_name: string;
  preparation_type_name?: string;
  cut_size_name?: string;
  qty_per_day: number;
  qty_for_target_duration: number;
  base_uom_name: string;
  parent_consuming_animals_count?: number;
}

export interface GroupedChoiceIngredient {
  choice_group_name: string; // From type_name when type is 'ingredientwithchoice'
  total_qty_per_day: number;
  total_qty_for_target_duration: number;
  base_uom_name: string;
  ingredients: ChoiceIngredientItem[];
  consuming_species: string[]; // List of unique common names of species (for modal)
  consuming_animals_count: number; // Count of unique animals consuming this choice group
  consuming_species_details: SpeciesConsumptionDetail[]; // Detailed breakdown
  scheduled_meal_times: string[]; // Unique meal times for this choice group
}

export interface ProcessedChoiceIngredientsResult {
  data: GroupedChoiceIngredient[];
  totalAnimals: number; // Global count based on filters
  totalSpecies: number; // Global count based on filters
}


export interface ColumnDefinition<T extends object> {
  key: keyof T | string;
  header: string;
  cell?: (row: T) => React.ReactNode;
}
