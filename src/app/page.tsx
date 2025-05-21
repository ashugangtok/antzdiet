
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { FileUpload } from '@/components/FileUpload';
import { SectionCard } from '@/components/SectionCard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/DataTable';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type {
  DietEntry, SiteIngredientsData, ColumnDefinition, DetailedRawMaterialData,
  ProcessedIngredientTotalsResult, ProcessedDetailedRawMaterialResult,
  ProcessedRecipeDataResult, RecipeIngredientItem, GroupedRecipe,
  ProcessedComboIngredientsResult, GroupedComboIngredient, ComboIngredientItem,
  ProcessedChoiceIngredientsResult, GroupedChoiceIngredient, ChoiceIngredientItem, SpeciesConsumptionDetail
} from '@/types';
import {
  parseExcelFile, processOverallIngredientTotals, processDetailedRawMaterialTotals, processRecipeData,
  processComboIngredientUsage, getUniqueSiteNames as getAllUniqueSiteNames,
  getUniqueSpeciesNames as getAllUniqueSpeciesNames,
  getUniqueClassNames as getAllUniqueClassNames,
  getUniqueMealTimes as getAllUniqueMealTimes,
  processChoiceIngredientUsage,
  applyGlobalFilters, getGlobalCounts
} from '@/lib/excelParser';
import { Leaf, Utensils, Filter, Loader2, ChevronsUpDown, Download, Info } from 'lucide-react';
// import { Sparkles } from 'lucide-react'; // For AI Summary
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
// import { summarizeDiet, type SummarizeDietInput } from '@/ai/flows/summarize-diet-flow';


const dayOptionsConfig = [
    { label: "7 Days", value: 7 },
    { label: "15 Days", value: 15 },
    { label: "30 Days", value: 30 },
];

const getDayOptions = (autoDetectedInputDuration: number) => {
    const options = [...dayOptionsConfig];
    const oneDayOption = { label: "1 Day", value: 1 };

    if (autoDetectedInputDuration === 7) {
        // For 7-day input, all options including "1 Day" are potentially relevant for projection.
        // If "1 Day" is not already the first, add it.
        if (!options.some(opt => opt.value === 1)) {
          // options.unshift(oneDayOption); // "1 Day" will be hidden if input is 7 days
        }
        return options;
    } else { // autoDetectedInputDuration is 1
        // For 1-day input, only "1 Day" is truly relevant, others are projections but might be disabled.
        // Ensure "1 Day" is present.
         if (!options.some(opt => opt.value === 1)) {
          options.unshift(oneDayOption);
        }
        return options;
    }
};


export default function DietInsightsPage() {
  const [dietData, setDietData] = useState<DietEntry[] | null>(null);
  const [overallIngredientsData, setOverallIngredientsData] = useState<ProcessedIngredientTotalsResult | null>(null);
  const [detailedRawMaterialsData, setDetailedRawMaterialsData] = useState<ProcessedDetailedRawMaterialResult | null>(null);
  const [recipesData, setRecipesData] = useState<ProcessedRecipeDataResult | null>(null);
  const [comboIngredientsData, setComboIngredientsData] = useState<ProcessedComboIngredientsResult | null>(null);
  const [choiceIngredientsData, setChoiceIngredientsData] = useState<ProcessedChoiceIngredientsResult | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false); // For initial file upload parsing

  const [isProcessingOverall, setIsProcessingOverall] = useState(false);
  const [isProcessingDetailedRaw, setIsProcessingDetailedRaw] = useState(false);
  const [isProcessingRecipes, setIsProcessingRecipes] = useState(false);
  const [isProcessingCombo, setIsProcessingCombo] = useState(false);
  const [isProcessingChoice, setIsProcessingChoice] = useState(false);


  const [progress, setProgress] = useState(0);
  const [activeTab, setActiveTab] = useState("upload");

  // Store all unique values from the original dataset
  const [allSiteNames, setAllSiteNames] = useState<string[]>([]);
  const [allSpeciesNames, setAllSpeciesNames] = useState<string[]>([]);
  const [allClassNames, setAllClassNames] = useState<string[]>([]);
  const [allMealTimes, setAllMealTimes] = useState<string[]>([]);

  // Store currently available unique values for filter dropdowns
  const [uniqueSiteNames, setUniqueSiteNames] = useState<string[]>([]);
  const [uniqueSpeciesNames, setUniqueSpeciesNames] = useState<string[]>([]);
  const [uniqueClassNames, setUniqueClassNames] = useState<string[]>([]);
  const [uniqueMealTimes, setUniqueMealTimes] = useState<string[]>([]);


  const [selectedSiteNames, setSelectedSiteNames] = useState<string[]>([]);
  const [selectedSpeciesNames, setSelectedSpeciesNames] = useState<string[]>([]);
  const [selectedClassNames, setSelectedClassNames] = useState<string[]>([]);
  const [selectedMealTimes, setSelectedMealTimes] = useState<string[]>([]);

  const [autoDetectedInputDuration, setAutoDetectedInputDuration] = useState<number>(1);
  const [targetDisplayDuration, setTargetDisplayDuration] = useState<number>(1);
  const [excelMinDate, setExcelMinDate] = useState<Date | null>(null);
  const [excelMaxDate, setExcelMaxDate] = useState<Date | null>(null);

  const [isSpeciesListModalOpen, setIsSpeciesListModalOpen] = useState(false);
  const [speciesListModalTitle, setSpeciesListModalTitle] = useState('');
  const [speciesListForModal, setSpeciesListForModal] = useState<SpeciesConsumptionDetail[]>([]);
  const [expandedSpeciesText, setExpandedSpeciesText] = useState<Record<string, boolean>>({});


  // const [aiSummary, setAiSummary] = useState<string | null>(null);
  // const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  // const [summaryError, setSummaryError] = useState<string | null>(null);

  const openSpeciesListModal = (title: string, details: SpeciesConsumptionDetail[]) => {
    setSpeciesListModalTitle(title);
    setSpeciesListForModal(details);
    setIsSpeciesListModalOpen(true);
  };

  const toggleSpeciesTextExpansion = (itemId: string) => {
    setExpandedSpeciesText(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const formatSpeciesDetails = (details: SpeciesConsumptionDetail[], limit?: number): string => {
    if (!details || details.length === 0) return "";
    const toFormat = limit && details.length > limit ? details.slice(0, limit) : details;
    let formattedString = `(${toFormat.map(d => `${d.name} (${d.animal_count})`).join(', ')}`;
    if (limit && details.length > limit) {
        // This part is now handled by the (view more) button logic, but good to keep the limit effective for initial display.
    }
    formattedString += ')';
    return formattedString;
  };


 const overallIngredientsColumns = useMemo((): ColumnDefinition<SiteIngredientsData>[] => {
    const columns: ColumnDefinition<SiteIngredientsData>[] = [
      { key: 'ingredient_name', header: 'Ingredient Name' },
    ];

    if (autoDetectedInputDuration === 7) {
      columns.push({
        key: 'qty_per_day',
        header: 'Qty / Day',
        cell: (item) => item.qty_per_day.toFixed(2)
      });
      columns.push({
        key: 'qty_for_target_duration',
        header: `Qty for ${targetDisplayDuration} Days`,
        cell: (item) => item.qty_for_target_duration.toFixed(2)
      });
    } else {
      columns.push({
        key: 'qty_for_target_duration',
        header: `Qty for ${targetDisplayDuration} Day${targetDisplayDuration > 1 ? 's' : ''}`,
        cell: (item) => item.qty_for_target_duration.toFixed(2)
      });
    }
    columns.push({ key: 'base_uom_name', header: 'Base UOM' });
    return columns;
  }, [autoDetectedInputDuration, targetDisplayDuration]);

  const detailedRawMaterialColumns = useMemo((): ColumnDefinition<DetailedRawMaterialData>[] => {
    const columns: ColumnDefinition<DetailedRawMaterialData>[] = [
      { key: 'ingredient_name', header: 'Ingredient Name' },
      { key: 'qty_per_day', header: 'Qty / Day', cell: (item) => item.qty_per_day.toFixed(2) },
      { key: 'base_uom_name', header: 'Base UOM' },
    ];
    return columns;
  }, []);


  const recipeIngredientDetailColumns = useMemo((): ColumnDefinition<RecipeIngredientItem>[] => {
    const columns: ColumnDefinition<RecipeIngredientItem>[] = [
      { key: 'ingredient_name', header: 'Ingredient Name' },
      { key: 'preparation_type_name', header: 'Preparation Type' },
      { key: 'cut_size_name', header: 'Cut Size' },
    ];
     if (autoDetectedInputDuration === 7) {
      columns.push({
        key: 'qty_per_day',
        header: 'Qty / Day',
        cell: (item) => item.qty_per_day.toFixed(4)
      });
    } else { 
      columns.push({
        key: 'qty_per_day',
        header: `Qty for 1 Day`, 
        cell: (item) => item.qty_per_day.toFixed(4)
      });
    }
    columns.push({
        key: 'total_qty_for_animals', 
        header: `Total Qty for Animals (${targetDisplayDuration} Day${targetDisplayDuration > 1 ? 's' : ''})`,
        cell: (item) => ((item.qty_for_target_duration * (item.parent_consuming_animals_count || 0)).toFixed(4))
    });
    columns.push({ key: 'base_uom_name', header: 'Base UOM' });
    return columns;
  }, [autoDetectedInputDuration, targetDisplayDuration]);

  const comboIngredientDetailColumns = useMemo((): ColumnDefinition<ComboIngredientItem>[] => {
     const columns: ColumnDefinition<ComboIngredientItem>[] = [
      { key: 'ingredient_name', header: 'Ingredient Name' },
      { key: 'preparation_type_name', header: 'Preparation Type' },
      { key: 'cut_size_name', header: 'Cut Size' },
    ];
    if (autoDetectedInputDuration === 7) {
      columns.push({
        key: 'qty_per_day',
        header: 'Qty / Day',
        cell: (item) => item.qty_per_day.toFixed(4)
      });
    } else {
      columns.push({
        key: 'qty_per_day',
        header: `Qty for 1 Day`,
        cell: (item) => item.qty_per_day.toFixed(4)
      });
    }
    columns.push({
        key: 'total_qty_for_animals',
        header: `Total Qty for Animals (${targetDisplayDuration} Day${targetDisplayDuration > 1 ? 's' : ''})`,
        cell: (item) => ((item.qty_for_target_duration * (item.parent_consuming_animals_count || 0)).toFixed(4))
    });
    columns.push({ key: 'base_uom_name', header: 'Base UOM' });
    return columns;
  }, [autoDetectedInputDuration, targetDisplayDuration]);

  const choiceIngredientDetailColumns = useMemo((): ColumnDefinition<ChoiceIngredientItem>[] => {
     const columns: ColumnDefinition<ChoiceIngredientItem>[] = [
      { key: 'ingredient_name', header: 'Ingredient Name' },
      { key: 'preparation_type_name', header: 'Preparation Type' },
      { key: 'cut_size_name', header: 'Cut Size' },
    ];
    if (autoDetectedInputDuration === 7) {
      columns.push({
        key: 'qty_per_day',
        header: 'Qty / Day',
        cell: (item) => item.qty_per_day.toFixed(4)
      });
    } else {
      columns.push({
        key: 'qty_per_day',
        header: `Qty for 1 Day`,
        cell: (item) => item.qty_per_day.toFixed(4)
      });
    }
    columns.push({
        key: 'total_qty_for_animals',
        header: `Total Qty for Animals (${targetDisplayDuration} Day${targetDisplayDuration > 1 ? 's' : ''})`,
        cell: (item) => ((item.qty_for_target_duration * (item.parent_consuming_animals_count || 0)).toFixed(4))
    });
    columns.push({ key: 'base_uom_name', header: 'Base UOM' });
    return columns;
  }, [autoDetectedInputDuration, targetDisplayDuration]);

  const groupIngredientsByCutSize = <T extends { cut_size_name?: string }>(ingredients: T[]): Map<string, T[]> => {
    const grouped = new Map<string, T[]>();
    ingredients.forEach(ingredient => {
      const cutSize = ingredient.cut_size_name || 'N/A';
      if (!grouped.has(cutSize)) {
        grouped.set(cutSize, []);
      }
      grouped.get(cutSize)!.push(ingredient);
    });
    return grouped;
  };


  const resetState = () => {
    setDietData(null);
    setOverallIngredientsData(null);
    setDetailedRawMaterialsData(null);
    setRecipesData(null);
    setComboIngredientsData(null);
    setChoiceIngredientsData(null);
    setError(null);
    setProgress(0);

    setAllSiteNames([]);
    setAllClassNames([]);
    setAllSpeciesNames([]);
    setAllMealTimes([]);
    setUniqueSiteNames([]);
    setUniqueClassNames([]);
    setUniqueSpeciesNames([]);
    setUniqueMealTimes([]);

    setSelectedSiteNames([]);
    setSelectedSpeciesNames([]);
    setSelectedClassNames([]);
    setSelectedMealTimes([]);
    setAutoDetectedInputDuration(1);
    setExpandedSpeciesText({});

    const currentDayOptions = getDayOptions(1); 
    const defaultTargetDuration = currentDayOptions.find(opt => opt.value === 1)?.value || currentDayOptions[0]?.value || 1;
    setTargetDisplayDuration(defaultTargetDuration);

    setExcelMinDate(null);
    setExcelMaxDate(null);
    // setAiSummary(null);
    // setSummaryError(null);
    setActiveTab("upload");
  };

  const handleFileUpload = useCallback(async (file: File) => {
    resetState();
    setIsLoading(true);
    setProgress(30);
    let parsedDataSuccessfully = false;

    try {
      const { data: parsedData, detectedInputDuration, minDate, maxDate } = await parseExcelFile(file);
      setProgress(60);
      setDietData(parsedData); // This will trigger the main useEffect
      setAutoDetectedInputDuration(detectedInputDuration);
      setExcelMinDate(minDate);
      setExcelMaxDate(maxDate);

      // Set initial "all" filter options
      setAllSiteNames(getAllUniqueSiteNames(parsedData));
      setAllSpeciesNames(getAllUniqueSpeciesNames(parsedData));
      setAllClassNames(getAllUniqueClassNames(parsedData));
      setAllMealTimes(getAllUniqueMealTimes(parsedData));
      
      // Set initial unique filter options (will be refined by another useEffect)
      setUniqueSiteNames(getAllUniqueSiteNames(parsedData));
      setUniqueSpeciesNames(getAllUniqueSpeciesNames(parsedData));
      setUniqueClassNames(getAllUniqueClassNames(parsedData));
      setUniqueMealTimes(getAllUniqueMealTimes(parsedData));


      let newTargetDuration = targetDisplayDuration;
      if (detectedInputDuration === 7) {
        if (targetDisplayDuration === 1 || !getDayOptions(7).some(opt => opt.value === targetDisplayDuration)) {
          newTargetDuration = 7;
        }
      } else { // detectedInputDuration is 1
        if (targetDisplayDuration > 1 || !getDayOptions(1).some(opt => opt.value === targetDisplayDuration)) {
           newTargetDuration = 1;
        }
      }
      setTargetDisplayDuration(newTargetDuration);


      setError(null);
      parsedDataSuccessfully = true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred during file processing.';
      setError(errorMessage);
      setDietData(null);
    } finally {
      setProgress(100);
      setTimeout(() => {
        setIsLoading(false);
        setProgress(0);
        if (parsedDataSuccessfully) {
             setActiveTab("raw-materials"); // Changed to raw-materials
        }
      }, 500);
    }
  }, [targetDisplayDuration]); 

 useEffect(() => {
    if (!dietData) {
      setOverallIngredientsData(null);
      setDetailedRawMaterialsData(null);
      setRecipesData(null);
      setComboIngredientsData(null);
      setChoiceIngredientsData(null);
      return;
    }

    const processAllData = async () => {
      setIsProcessingOverall(true);
      setIsProcessingDetailedRaw(true);
      setIsProcessingRecipes(true);
      setIsProcessingCombo(true);
      setIsProcessingChoice(true);

      const globallyFilteredData = applyGlobalFilters(
        dietData, selectedSiteNames, selectedClassNames, selectedSpeciesNames, selectedMealTimes
      );
      const globalCounts = getGlobalCounts(globallyFilteredData);

      try {
        const overallResult = processOverallIngredientTotals(
          globallyFilteredData, globalCounts.totalAnimals, globalCounts.totalSpecies,
          autoDetectedInputDuration, targetDisplayDuration
        );
        setOverallIngredientsData(overallResult);
      } catch (processingError) {
        const errorMessage = processingError instanceof Error ? processingError.message : 'An unknown error occurred during overall ingredient analysis.';
        setError(prev => prev ? `${prev}\nOverall: ${errorMessage}` : `Overall: ${errorMessage}`);
        setOverallIngredientsData(null);
      } finally {
        setIsProcessingOverall(false);
      }

      try {
        const detailedRawResult = processDetailedRawMaterialTotals(
          globallyFilteredData, globalCounts.totalAnimals, globalCounts.totalSpecies,
          autoDetectedInputDuration, targetDisplayDuration
        );
        setDetailedRawMaterialsData(detailedRawResult);
      } catch (processingError) {
        const errorMessage = processingError instanceof Error ? processingError.message : 'An unknown error occurred during detailed raw material analysis.';
        setError(prev => prev ? `${prev}\nDetailed Raw: ${errorMessage}` : `Detailed Raw: ${errorMessage}`);
        setDetailedRawMaterialsData(null);
      } finally {
        setIsProcessingDetailedRaw(false);
      }

      try {
        const recipeResult = processRecipeData(
          dietData, 
          globallyFilteredData,
          globalCounts.totalAnimals, globalCounts.totalSpecies,
          autoDetectedInputDuration, targetDisplayDuration
        );
        setRecipesData(recipeResult);
      } catch (processingError) {
        const errorMessage = processingError instanceof Error ? processingError.message : 'An unknown error occurred during recipe analysis.';
        setError(prev => prev ? `${prev}\nRecipes: ${errorMessage}` : `Recipes: ${errorMessage}`);
        setRecipesData(null);
      } finally {
        setIsProcessingRecipes(false);
      }

      try {
        const comboResult = processComboIngredientUsage(
          dietData, 
          globallyFilteredData,
          globalCounts.totalAnimals, globalCounts.totalSpecies,
          autoDetectedInputDuration, targetDisplayDuration
        );
        setComboIngredientsData(comboResult);
      } catch (processingError) {
        const errorMessage = processingError instanceof Error ? processingError.message : 'An unknown error occurred during combo ingredient analysis.';
        setError(prev => prev ? `${prev}\nCombo: ${errorMessage}` : `Combo: ${errorMessage}`);
        setComboIngredientsData(null);
      } finally {
        setIsProcessingCombo(false);
      }

      try {
        const choiceResult = processChoiceIngredientUsage(
          dietData, 
          globallyFilteredData,
          globalCounts.totalAnimals, globalCounts.totalSpecies,
          autoDetectedInputDuration, targetDisplayDuration
        );
        setChoiceIngredientsData(choiceResult);
      } catch (processingError) {
        const errorMessage = processingError instanceof Error ? processingError.message : 'An unknown error occurred during choice ingredient analysis.';
        setError(prev => prev ? `${prev}\nChoice: ${errorMessage}` : `Choice: ${errorMessage}`);
        setChoiceIngredientsData(null);
      } finally {
        setIsProcessingChoice(false);
      }
    };

    processAllData();
  }, [dietData, selectedSiteNames, selectedSpeciesNames, selectedClassNames, selectedMealTimes, autoDetectedInputDuration, targetDisplayDuration]);

  // Effect for updating dynamic filter options
  useEffect(() => {
    if (!dietData) {
      setUniqueSiteNames(allSiteNames);
      setUniqueClassNames(allClassNames);
      setUniqueSpeciesNames(allSpeciesNames);
      setUniqueMealTimes(allMealTimes);
      return;
    }

    // Helper function to get unique values based on current selections in other filters
    const getDynamicUniqueValues = (
        dataToFilter: DietEntry[],
        targetKey: keyof DietEntry, // The key for which we want unique values
        // Current selections for other filters
        filterSite: string[],
        filterClass: string[],
        filterSpecies: string[],
        filterMeal: string[]
    ): string[] => {
      let filtered = dataToFilter;

      // Apply other active filters before extracting unique values for the targetKey
      if (targetKey !== 'site_name' && filterSite.length > 0) {
        filtered = filtered.filter(e => e.site_name && filterSite.includes(e.site_name));
      }
      if (targetKey !== 'class_name' && filterClass.length > 0) {
        filtered = filtered.filter(e => e.class_name && filterClass.includes(e.class_name));
      }
      if (targetKey !== 'common_name' && filterSpecies.length > 0) {
        filtered = filtered.filter(e => e.common_name && filterSpecies.includes(e.common_name));
      }
      if (targetKey !== 'meal_time' && filterMeal.length > 0) {
        filtered = filtered.filter(e => e.meal_time && filterMeal.includes(e.meal_time));
      }
      // Extract unique values for the targetKey from the now-filtered data
      return Array.from(new Set(filtered.map(entry => entry[targetKey]).filter(Boolean) as string[])).sort();
    };
    
    setUniqueSiteNames(getDynamicUniqueValues(dietData, 'site_name', [], selectedClassNames, selectedSpeciesNames, selectedMealTimes));
    setUniqueClassNames(getDynamicUniqueValues(dietData, 'class_name', selectedSiteNames, [], selectedSpeciesNames, selectedMealTimes));
    setUniqueSpeciesNames(getDynamicUniqueValues(dietData, 'common_name', selectedSiteNames, selectedClassNames, [], selectedMealTimes));
    setUniqueMealTimes(getDynamicUniqueValues(dietData, 'meal_time', selectedSiteNames, selectedClassNames, selectedSpeciesNames, []));

  }, [dietData, selectedSiteNames, selectedClassNames, selectedSpeciesNames, selectedMealTimes, allSiteNames, allClassNames, allSpeciesNames, allMealTimes]);


  const formattedDateRangeTitle = useMemo(() => {
    const baseTitle = "Ingredient Totals"; 
    const suffix = "(Excluding Ingredients with Choice)";

    if (!excelMinDate) {
      return `${baseTitle} ${suffix}`;
    }
    const minF = format(excelMinDate, "MMM d, yyyy");
    if (!excelMaxDate || excelMinDate.getTime() === excelMaxDate.getTime()) {
      return `${baseTitle} for ${minF} ${suffix}`;
    }
    const maxF = format(excelMaxDate, "MMM d, yyyy");
    if (excelMinDate.getFullYear() === excelMaxDate.getFullYear()) {
      if (excelMinDate.getMonth() === excelMaxDate.getMonth()) {
        return `${baseTitle} for ${format(excelMinDate, "MMM d")} - ${format(excelMaxDate, "d, yyyy")} ${suffix}`;
      }
      return `${baseTitle} for ${format(excelMinDate, "MMM d")} - ${format(excelMaxDate, "MMM d, yyyy")} ${suffix}`;
    }
    return `${baseTitle} for ${minF} - ${maxF} ${suffix}`;
  }, [excelMinDate, excelMaxDate]);

  const formattedDetailedRawMaterialTitle = useMemo(() => {
    const baseTitle = "Raw Materials Required";
    const suffix = "(Excluding Ingredients with Choice)";
    if (!excelMinDate) return `${baseTitle} ${suffix}`;
    const minF = format(excelMinDate, "MMM d, yyyy");
    if (!excelMaxDate || excelMinDate.getTime() === excelMaxDate.getTime()) return `${baseTitle} for ${minF} ${suffix}`;
    const maxF = format(excelMaxDate, "MMM d, yyyy");
    if (excelMinDate.getFullYear() === excelMaxDate.getFullYear()) {
      if (excelMinDate.getMonth() === excelMaxDate.getMonth()) return `${baseTitle} for ${format(excelMinDate, "MMM d")} - ${format(excelMaxDate, "d, yyyy")} ${suffix}`;
      return `${baseTitle} for ${format(excelMinDate, "MMM d")} - ${format(excelMaxDate, "MMM d, yyyy")} ${suffix}`;
    }
    return `${baseTitle} for ${minF} - ${maxF} ${suffix}`;
  }, [excelMinDate, excelMaxDate]);

  const formattedRecipesTitle = useMemo(() => {
    const baseTitle = "Recipes - Ingredients Required";
    if (!excelMinDate) return baseTitle;
    const minF = format(excelMinDate, "MMM d, yyyy");
    if (!excelMaxDate || excelMinDate.getTime() === excelMaxDate.getTime()) return `${baseTitle} for ${minF}`;
    const maxF = format(excelMaxDate, "MMM d, yyyy");
     if (excelMinDate.getFullYear() === excelMaxDate.getFullYear()) {
      if (excelMinDate.getMonth() === excelMaxDate.getMonth()) return `${baseTitle} for ${format(excelMinDate, "MMM d")} - ${format(excelMaxDate, "d, yyyy")}`;
      return `${baseTitle} for ${format(excelMinDate, "MMM d")} - ${format(excelMaxDate, "MMM d, yyyy")}`;
    }
    return `${baseTitle} for ${minF} - ${maxF}`;
  }, [excelMinDate, excelMaxDate]);

  const formattedComboTitle = useMemo(() => {
    const baseTitle = "Combo Ingredient Usage";
    if (!excelMinDate) return baseTitle;
    const minF = format(excelMinDate, "MMM d, yyyy");
    if (!excelMaxDate || excelMinDate.getTime() === excelMaxDate.getTime()) return `${baseTitle} for ${minF}`;
    const maxF = format(excelMaxDate, "MMM d, yyyy");
    if (excelMinDate.getFullYear() === excelMaxDate.getFullYear()) {
      if (excelMinDate.getMonth() === excelMaxDate.getMonth()) return `${baseTitle} for ${format(excelMinDate, "MMM d")} - ${format(excelMaxDate, "d, yyyy")}`;
      return `${baseTitle} for ${format(excelMinDate, "MMM d")} - ${format(excelMaxDate, "MMM d, yyyy")}`;
    }
    return `${baseTitle} for ${minF} - ${maxF}`;
  }, [excelMinDate, excelMaxDate]);

  const formattedChoiceTitle = useMemo(() => {
    const baseTitle = "Choice Ingredient Usage";
    if (!excelMinDate) return baseTitle;
    const minF = format(excelMinDate, "MMM d, yyyy");
    if (!excelMaxDate || excelMinDate.getTime() === excelMaxDate.getTime()) return `${baseTitle} for ${minF}`;
    const maxF = format(excelMaxDate, "MMM d, yyyy");
    if (excelMinDate.getFullYear() === excelMaxDate.getFullYear()) {
      if (excelMinDate.getMonth() === excelMaxDate.getMonth()) return `${baseTitle} for ${format(excelMinDate, "MMM d")} - ${format(excelMaxDate, "d, yyyy")}`;
      return `${baseTitle} for ${format(excelMinDate, "MMM d")} - ${format(excelMaxDate, "MMM d, yyyy")}`;
    }
    return `${baseTitle} for ${minF} - ${maxF}`;
  }, [excelMinDate, excelMaxDate]);


  const displayableRecipes = useMemo(() =>
    (recipesData?.data?.filter(recipe => recipe.ingredients.length > 0)) || [],
  [recipesData]);

  const displayableCombos = useMemo(() =>
    (comboIngredientsData?.data?.filter(group => group.ingredients.length > 0)) || [],
  [comboIngredientsData]);

  const displayableChoices = useMemo(() =>
    (choiceIngredientsData?.data?.filter(group => group.ingredients.length > 0)) || [],
  [choiceIngredientsData]);


  const handleAllRecipesPdfDownload = () => {
     if (!displayableRecipes || displayableRecipes.length === 0) {
      alert("No recipes with ingredients to download based on current filters.");
      return;
    }

    const doc = new jsPDF();
    let currentY = 22;

    doc.setFontSize(16);
    doc.text(formattedRecipesTitle, 14, 16);
    doc.setFontSize(10);

    displayableRecipes.forEach((recipe, index) => {
      if (index > 0) {
        currentY += 15; // Add some space between recipes
      }
      const speciesDetailsString = formatSpeciesDetails(recipe.consuming_species_details);
      const scheduledTimesString = recipe.scheduled_meal_times.length > 0 ? recipe.scheduled_meal_times.map(t => t.trim()).filter(Boolean).join(', ') : 'N/A';

      const ingredientsByCutSize = groupIngredientsByCutSize(recipe.ingredients);
      let estimatedRecipeHeight = 50 + (speciesDetailsString.length / 50 * 4) + (scheduledTimesString.length / 50 * 4); // Approximate base height
      ingredientsByCutSize.forEach((ingredientsForCut, cutSize) => {
        estimatedRecipeHeight += 10; // for cut size header
        estimatedRecipeHeight += ingredientsForCut.length * 8; // for ingredient rows (approx)
      });


      if (currentY + estimatedRecipeHeight > doc.internal.pageSize.getHeight() - 20) { // Check if content fits
        doc.addPage();
        currentY = 22; // Reset Y for new page
        doc.setFontSize(16);
        doc.text(formattedRecipesTitle + " (cont.)", 14, 16);
        doc.setFontSize(10);
      }

      doc.setFontSize(12);
      let recipeTitle = recipe.recipe_name;
      if (selectedMealTimes.length === 1) {
        recipeTitle += ` - ${selectedMealTimes[0]}`;
      }
      doc.text(recipeTitle, 14, currentY);
      currentY += 7;
      doc.setFontSize(8);

      let totalQtyText = "";
      if (autoDetectedInputDuration === 7) {
        totalQtyText = `Total / Day: ${recipe.total_qty_per_day.toFixed(4)} ${recipe.base_uom_name}  |  Total for ${targetDisplayDuration} Days: ${recipe.total_qty_for_target_duration.toFixed(4)} ${recipe.base_uom_name}`;
      } else {
        totalQtyText = `Total for ${targetDisplayDuration} Day${targetDisplayDuration > 1 ? 's' : ''}: ${recipe.total_qty_for_target_duration.toFixed(4)} ${recipe.base_uom_name}`;
      }
      doc.text(totalQtyText, 14, currentY);
      currentY += 5;

      const speciesText = `Consuming Species: ${recipe.consuming_species_details.length} ${formatSpeciesDetails(recipe.consuming_species_details)}`;
      const splitSpeciesText = doc.splitTextToSize(speciesText, doc.internal.pageSize.getWidth() - 28); // Adjust width as needed
      doc.text(splitSpeciesText, 14, currentY);
      currentY += (splitSpeciesText.length * 4) + 1; // Adjust spacing based on lines

      doc.text(`Consuming Animals: ${recipe.consuming_animals_count}`, 14, currentY);
      currentY += 5;

      const mealTimesText = `Scheduled Meal Times: ${scheduledTimesString}`;
      const splitMealTimesText = doc.splitTextToSize(mealTimesText, doc.internal.pageSize.getWidth() - 28);
      doc.text(splitMealTimesText, 14, currentY);
      currentY += (splitMealTimesText.length * 4) + 2;


      const tableColumnNames = recipeIngredientDetailColumns.map(col => col.header);

      ingredientsByCutSize.forEach((ingredientsForCut, cutSize) => {
        doc.setFontSize(10);
        doc.text(`Cut Size: ${cutSize}`, 14, currentY);
        currentY += 5;
        doc.setFontSize(8);

        const tableRows = ingredientsForCut.map(ingredientRow =>
          recipeIngredientDetailColumns.map(col => {
            if (col.cell) {
              const cellValue = col.cell(ingredientRow);
              return String(cellValue ?? '');
            }
            const rawValue = (ingredientRow as any)[col.key as string];
            return String(rawValue ?? '');
          })
        );

        (doc as any).autoTable({
          head: [tableColumnNames],
          body: tableRows,
          startY: currentY,
          theme: 'striped',
          headStyles: { fillColor: [75, 85, 99] },
          styles: { fontSize: 8, cellPadding: 1.5, overflow: 'linebreak' },
          columnStyles: {text: {cellWidth: 'auto'}},
        });
        currentY = (doc as any).lastAutoTable.finalY + 5; // Update Y position after table
      });
    });

    doc.save('all_recipes_report.pdf');
  };

  const handleSingleRecipePdfDownload = (recipe: GroupedRecipe) => {
    if (!recipe || recipe.ingredients.length === 0) {
      alert("No ingredient data for this recipe to download.");
      return;
    }

    const doc = new jsPDF();
    let currentY = 22;

    doc.setFontSize(16);
    let recipeTitle = recipe.recipe_name;
    if (selectedMealTimes.length === 1) {
      recipeTitle += ` - ${selectedMealTimes[0]}`;
    }
    doc.text(recipeTitle, 14, 16);
    currentY = 22;
    doc.setFontSize(8);

    let totalQtyText = "";
    if (autoDetectedInputDuration === 7) {
      totalQtyText = `Total / Day: ${recipe.total_qty_per_day.toFixed(4)} ${recipe.base_uom_name}  |  Total for ${targetDisplayDuration} Days: ${recipe.total_qty_for_target_duration.toFixed(4)} ${recipe.base_uom_name}`;
    } else {
      totalQtyText = `Total for ${targetDisplayDuration} Day${targetDisplayDuration > 1 ? 's' : ''}: ${recipe.total_qty_for_target_duration.toFixed(4)} ${recipe.base_uom_name}`;
    }
    doc.text(totalQtyText, 14, currentY);
    currentY += 5;

    const speciesText = `Consuming Species: ${recipe.consuming_species_details.length} ${formatSpeciesDetails(recipe.consuming_species_details)}`;
    const splitSpeciesText = doc.splitTextToSize(speciesText, doc.internal.pageSize.getWidth() - 28);
    doc.text(splitSpeciesText, 14, currentY);
    currentY += (splitSpeciesText.length * 4) + 1;

    doc.text(`Consuming Animals: ${recipe.consuming_animals_count}`, 14, currentY);
    currentY += 5;

    const scheduledTimesString = recipe.scheduled_meal_times.length > 0 ? recipe.scheduled_meal_times.map(t => t.trim()).filter(Boolean).join(', ') : 'N/A';
    const mealTimesText = `Scheduled Meal Times: ${scheduledTimesString}`;
    const splitMealTimesText = doc.splitTextToSize(mealTimesText, doc.internal.pageSize.getWidth() - 28);
    doc.text(splitMealTimesText, 14, currentY);
    currentY += (splitMealTimesText.length * 4) + 2;


    const tableColumnNames = recipeIngredientDetailColumns.map(col => col.header);
    const ingredientsByCutSize = groupIngredientsByCutSize(recipe.ingredients);

    ingredientsByCutSize.forEach((ingredientsForCut, cutSize) => {
      doc.setFontSize(10);
      doc.text(`Cut Size: ${cutSize}`, 14, currentY);
      currentY += 5;
      doc.setFontSize(8);

      const tableRows = ingredientsForCut.map(ingredientRow =>
        recipeIngredientDetailColumns.map(col => {
          if (col.cell) {
            const cellValue = col.cell(ingredientRow);
            return String(cellValue ?? '');
          }
          const rawValue = (ingredientRow as any)[col.key as string];
          return String(rawValue ?? '');
        })
      );

      (doc as any).autoTable({
          head: [tableColumnNames],
          body: tableRows,
          startY: currentY,
          theme: 'striped',
          headStyles: { fillColor: [75, 85, 99] },
          styles: { fontSize: 8, cellPadding: 1.5, overflow: 'linebreak' },
          columnStyles: {text: {cellWidth: 'auto'}},
        });
      currentY = (doc as any).lastAutoTable.finalY + 5;
    });


    const fileName = `Recipe_${recipe.recipe_name.replace(/\s+/g, '_')}_${targetDisplayDuration}Days.pdf`;
    doc.save(fileName);
  };

  // PDF Handlers for Combo Ingredients
  const handleAllCombosPdfDownload = () => {
    if (!displayableCombos || displayableCombos.length === 0) {
      alert("No combo ingredients with items to download based on current filters.");
      return;
    }

    const doc = new jsPDF();
    let currentY = 22;
    doc.setFontSize(16);
    doc.text(formattedComboTitle, 14, 16);
    doc.setFontSize(10);

    displayableCombos.forEach((group, index) => {
      if (index > 0) currentY += 15;
      const speciesDetailsString = formatSpeciesDetails(group.consuming_species_details);
      const scheduledTimesString = group.scheduled_meal_times.length > 0 ? group.scheduled_meal_times.map(t => t.trim()).filter(Boolean).join(', ') : 'N/A';

      const ingredientsByCutSize = groupIngredientsByCutSize(group.ingredients);
      let estimatedHeight = 50 + (speciesDetailsString.length / 50 * 4) + (scheduledTimesString.length / 50 * 4);
      ingredientsByCutSize.forEach((ingredientsForCut, cutSize) => {
        estimatedHeight += 10;
        estimatedHeight += ingredientsForCut.length * 8;
      });

      if (currentY + estimatedHeight > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        currentY = 22;
        doc.setFontSize(16);
        doc.text(formattedComboTitle + " (cont.)", 14, 16);
        doc.setFontSize(10);
      }
      doc.setFontSize(12);
      let groupTitle = group.combo_group_name;
      if (selectedMealTimes.length === 1) {
        groupTitle += ` - ${selectedMealTimes[0]}`;
      }
      doc.text(groupTitle, 14, currentY);

      currentY += 7;
      doc.setFontSize(8);
      let totalQtyText = autoDetectedInputDuration === 7
        ? `Total / Day: ${group.total_qty_per_day.toFixed(4)} ${group.base_uom_name} | Total for ${targetDisplayDuration} Days: ${group.total_qty_for_target_duration.toFixed(4)} ${group.base_uom_name}`
        : `Total for ${targetDisplayDuration} Day${targetDisplayDuration > 1 ? 's' : ''}: ${group.total_qty_for_target_duration.toFixed(4)} ${group.base_uom_name}`;
      doc.text(totalQtyText, 14, currentY);
      currentY += 5;
      const speciesText = `Consuming Species: ${group.consuming_species_details.length} ${formatSpeciesDetails(group.consuming_species_details)}`;
      const splitSpeciesText = doc.splitTextToSize(speciesText, doc.internal.pageSize.getWidth() - 28);
      doc.text(splitSpeciesText, 14, currentY);
      currentY += (splitSpeciesText.length * 4) + 1;
      doc.text(`Consuming Animals: ${group.consuming_animals_count}`, 14, currentY);
      currentY += 5;

      const mealTimesTextPdf = `Scheduled Meal Times: ${scheduledTimesString}`;
      const splitMealTimesTextPdf = doc.splitTextToSize(mealTimesTextPdf, doc.internal.pageSize.getWidth() - 28);
      doc.text(splitMealTimesTextPdf, 14, currentY);
      currentY += (splitMealTimesTextPdf.length * 4) + 2;


      const tableColumnNames = comboIngredientDetailColumns.map(col => col.header);
      ingredientsByCutSize.forEach((ingredientsForCut, cutSize) => {
        doc.setFontSize(10);
        doc.text(`Cut Size: ${cutSize}`, 14, currentY);
        currentY += 5;
        doc.setFontSize(8);
        (doc as any).autoTable({
          head: [tableColumnNames],
          body: ingredientsForCut.map(item => comboIngredientDetailColumns.map(col => col.cell ? String(col.cell(item) ?? '') : String((item as any)[col.key as string] ?? ''))),
          startY: currentY, theme: 'striped', headStyles: { fillColor: [75, 85, 99] }, styles: { fontSize: 8, cellPadding: 1.5, overflow: 'linebreak' }, columnStyles: {text: {cellWidth: 'auto'}},
        });
        currentY = (doc as any).lastAutoTable.finalY + 5;
      });
    });
    doc.save('all_combo_ingredients_report.pdf');
  };

  const handleSingleComboPdfDownload = (group: GroupedComboIngredient) => {
    if (!group || group.ingredients.length === 0) return alert("No ingredient data for this combo group to download.");
    const doc = new jsPDF();
    let currentY = 22;
    doc.setFontSize(16);
    let groupTitle = group.combo_group_name;
    if (selectedMealTimes.length === 1) {
        groupTitle += ` - ${selectedMealTimes[0]}`;
    }
    doc.text(groupTitle, 14, 16);

    doc.setFontSize(8); currentY = 22;
    let totalQtyText = autoDetectedInputDuration === 7
      ? `Total / Day: ${group.total_qty_per_day.toFixed(4)} ${group.base_uom_name} | Total for ${targetDisplayDuration} Days: ${group.total_qty_for_target_duration.toFixed(4)} ${group.base_uom_name}`
      : `Total for ${targetDisplayDuration} Day${targetDisplayDuration > 1 ? 's' : ''}: ${group.total_qty_for_target_duration.toFixed(4)} ${group.base_uom_name}`;
    doc.text(totalQtyText, 14, currentY); currentY += 5;
    const speciesText = `Consuming Species: ${group.consuming_species_details.length} ${formatSpeciesDetails(group.consuming_species_details)}`;
    const splitSpeciesText = doc.splitTextToSize(speciesText, doc.internal.pageSize.getWidth() - 28);
    doc.text(splitSpeciesText, 14, currentY); currentY += (splitSpeciesText.length * 4) + 1;
    doc.text(`Consuming Animals: ${group.consuming_animals_count}`, 14, currentY); currentY += 5;

    const scheduledTimesString = group.scheduled_meal_times.length > 0 ? group.scheduled_meal_times.map(t => t.trim()).filter(Boolean).join(', ') : 'N/A';
    const mealTimesTextPdf = `Scheduled Meal Times: ${scheduledTimesString}`;
    const splitMealTimesTextPdf = doc.splitTextToSize(mealTimesTextPdf, doc.internal.pageSize.getWidth() - 28);
    doc.text(splitMealTimesTextPdf, 14, currentY);
    currentY += (splitMealTimesTextPdf.length * 4) + 2;

    const tableColumnNames = comboIngredientDetailColumns.map(col => col.header);
    const ingredientsByCutSize = groupIngredientsByCutSize(group.ingredients);

    ingredientsByCutSize.forEach((ingredientsForCut, cutSize) => {
        doc.setFontSize(10);
        doc.text(`Cut Size: ${cutSize}`, 14, currentY);
        currentY += 5;
        doc.setFontSize(8);
        (doc as any).autoTable({
          head: [tableColumnNames],
          body: ingredientsForCut.map(item => comboIngredientDetailColumns.map(col => col.cell ? String(col.cell(item) ?? '') : String((item as any)[col.key as string] ?? ''))),
          startY: currentY, theme: 'striped', headStyles: { fillColor: [75, 85, 99] }, styles: { fontSize: 8, cellPadding: 1.5, overflow: 'linebreak' }, columnStyles: {text: {cellWidth: 'auto'}},
        });
        currentY = (doc as any).lastAutoTable.finalY + 5;
    });
    doc.save(`ComboGroup_${group.combo_group_name.replace(/\s+/g, '_')}_${targetDisplayDuration}Days.pdf`);
  };

  // PDF Handlers for Choice Ingredients
  const handleAllChoicesPdfDownload = () => {
     if (!displayableChoices || displayableChoices.length === 0) {
      alert("No choice ingredients with items to download based on current filters.");
      return;
    }

    const doc = new jsPDF();
    let currentY = 22;
    doc.setFontSize(16);
    doc.text(formattedChoiceTitle, 14, 16);
    doc.setFontSize(10);

    displayableChoices.forEach((group, index) => {
      if (index > 0) currentY += 15;
      const speciesDetailsString = formatSpeciesDetails(group.consuming_species_details);
      const scheduledTimesString = group.scheduled_meal_times.length > 0 ? group.scheduled_meal_times.map(t => t.trim()).filter(Boolean).join(', ') : 'N/A';

      const ingredientsByCutSize = groupIngredientsByCutSize(group.ingredients);
      let estimatedHeight = 50 + (speciesDetailsString.length / 50 * 4) + (scheduledTimesString.length / 50 * 4);
      ingredientsByCutSize.forEach((ingredientsForCut, cutSize) => {
        estimatedHeight += 10;
        estimatedHeight += ingredientsForCut.length * 8;
      });

      if (currentY + estimatedHeight > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage(); currentY = 22; doc.setFontSize(16);
        doc.text(formattedChoiceTitle + " (cont.)", 14, 16); doc.setFontSize(10);
      }
      doc.setFontSize(12);
      let groupTitle = group.choice_group_name;
      if (selectedMealTimes.length === 1) {
        groupTitle += ` - ${selectedMealTimes[0]}`;
      }
      doc.text(groupTitle, 14, currentY);
      currentY += 7;
      doc.setFontSize(8);
      let totalQtyText = autoDetectedInputDuration === 7
        ? `Total / Day: ${group.total_qty_per_day.toFixed(4)} ${group.base_uom_name} | Total for ${targetDisplayDuration} Days: ${group.total_qty_for_target_duration.toFixed(4)} ${group.base_uom_name}`
        : `Total for ${targetDisplayDuration} Day${targetDisplayDuration > 1 ? 's' : ''}: ${group.total_qty_for_target_duration.toFixed(4)} ${group.base_uom_name}`;
      doc.text(totalQtyText, 14, currentY); currentY += 5;
      const speciesText = `Consuming Species: ${group.consuming_species_details.length} ${formatSpeciesDetails(group.consuming_species_details)}`;
      const splitSpeciesText = doc.splitTextToSize(speciesText, doc.internal.pageSize.getWidth() - 28);
      doc.text(splitSpeciesText, 14, currentY); currentY += (splitSpeciesText.length * 4) + 1;
      doc.text(`Consuming Animals: ${group.consuming_animals_count}`, 14, currentY); currentY += 5;

      const mealTimesTextPdf = `Scheduled Meal Times: ${scheduledTimesString}`;
      const splitMealTimesTextPdf = doc.splitTextToSize(mealTimesTextPdf, doc.internal.pageSize.getWidth() - 28);
      doc.text(splitMealTimesTextPdf, 14, currentY);
      currentY += (splitMealTimesTextPdf.length * 4) + 2;


      const tableColumnNames = choiceIngredientDetailColumns.map(col => col.header);
      ingredientsByCutSize.forEach((ingredientsForCut, cutSize) => {
        doc.setFontSize(10);
        doc.text(`Cut Size: ${cutSize}`, 14, currentY);
        currentY += 5;
        doc.setFontSize(8);
        (doc as any).autoTable({
          head: [tableColumnNames],
          body: ingredientsForCut.map(item => choiceIngredientDetailColumns.map(col => col.cell ? String(col.cell(item) ?? '') : String((item as any)[col.key as string] ?? ''))),
          startY: currentY, theme: 'striped', headStyles: { fillColor: [75, 85, 99] }, styles: { fontSize: 8, cellPadding: 1.5, overflow: 'linebreak' }, columnStyles: {text: {cellWidth: 'auto'}},
        });
        currentY = (doc as any).lastAutoTable.finalY + 5;
      });
    });
    doc.save('all_choice_ingredients_report.pdf');
  };

  const handleSingleChoicePdfDownload = (group: GroupedChoiceIngredient) => {
    if (!group || group.ingredients.length === 0) return alert("No ingredient data for this choice group to download.");
    const doc = new jsPDF();
    let currentY = 22;
    doc.setFontSize(16);
    let groupTitle = group.choice_group_name;
    if (selectedMealTimes.length === 1) {
        groupTitle += ` - ${selectedMealTimes[0]}`;
    }
    doc.text(groupTitle, 14, 16);

    doc.setFontSize(8); currentY = 22;
    let totalQtyText = autoDetectedInputDuration === 7
      ? `Total / Day: ${group.total_qty_per_day.toFixed(4)} ${group.base_uom_name} | Total for ${targetDisplayDuration} Days: ${group.total_qty_for_target_duration.toFixed(4)} ${group.base_uom_name}`
      : `Total for ${targetDisplayDuration} Day${targetDisplayDuration > 1 ? 's' : ''}: ${group.total_qty_for_target_duration.toFixed(4)} ${group.base_uom_name}`;
    doc.text(totalQtyText, 14, currentY); currentY += 5;
    const speciesText = `Consuming Species: ${group.consuming_species_details.length} ${formatSpeciesDetails(group.consuming_species_details)}`;
    const splitSpeciesText = doc.splitTextToSize(speciesText, doc.internal.pageSize.getWidth() - 28);
    doc.text(splitSpeciesText, 14, currentY); currentY += (splitSpeciesText.length * 4) + 1;
    doc.text(`Consuming Animals: ${group.consuming_animals_count}`, 14, currentY); currentY += 5;

    const scheduledTimesString = group.scheduled_meal_times.length > 0 ? group.scheduled_meal_times.map(t => t.trim()).filter(Boolean).join(', ') : 'N/A';
    const mealTimesTextPdf = `Scheduled Meal Times: ${scheduledTimesString}`;
    const splitMealTimesTextPdf = doc.splitTextToSize(mealTimesTextPdf, doc.internal.pageSize.getWidth() - 28);
    doc.text(splitMealTimesTextPdf, 14, currentY);
    currentY += (splitMealTimesTextPdf.length * 4) + 2;


    const tableColumnNames = choiceIngredientDetailColumns.map(col => col.header);
    const ingredientsByCutSize = groupIngredientsByCutSize(group.ingredients);

    ingredientsByCutSize.forEach((ingredientsForCut, cutSize) => {
      doc.setFontSize(10);
      doc.text(`Cut Size: ${cutSize}`, 14, currentY);
      currentY += 5;
      doc.setFontSize(8);
      (doc as any).autoTable({
        head: [tableColumnNames],
        body: ingredientsForCut.map(item => choiceIngredientDetailColumns.map(col => col.cell ? String(col.cell(item) ?? '') : String((item as any)[col.key as string] ?? ''))),
        startY: currentY, theme: 'striped', headStyles: { fillColor: [75, 85, 99] }, styles: { fontSize: 8, cellPadding: 1.5, overflow: 'linebreak' }, columnStyles: {text: {cellWidth: 'auto'}},
      });
      currentY = (doc as any).lastAutoTable.finalY + 5;
    });
    doc.save(`ChoiceGroup_${group.choice_group_name.replace(/\s+/g, '_')}_${targetDisplayDuration}Days.pdf`);
  };


  const renderMultiSelectFilter = (
    label: string,
    options: string[],
    selectedValues: string[],
    onSelectionChange: (newValues: string[]) => void,
    placeholder: string,
    filterId: string,
    disabled: boolean
  ) => (
    <div className="flex-1 space-y-1 min-w-[150px] md:min-w-[200px]">
        <Label htmlFor={filterId} className="text-sm font-medium">{label}</Label>
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    id={filterId}
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between text-xs sm:text-sm"
                    disabled={disabled || options.length === 0}
                >
                    {selectedValues.length > 0
                        ? `${selectedValues.length} selected`
                        : placeholder}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <ScrollArea className="h-48">
                    {options.map((option) => (
                        <div key={option} className="flex items-center space-x-2 p-2 hover:bg-muted/50 rounded-md">
                            <Checkbox
                                id={`${filterId}-${option.replace(/\s+/g, '-')}`}
                                checked={selectedValues.includes(option)}
                                onCheckedChange={(checked) => {
                                    const newSelection = checked
                                        ? [...selectedValues, option]
                                        : selectedValues.filter((v) => v !== option);
                                    onSelectionChange(newSelection);
                                }}
                            />
                            <Label htmlFor={`${filterId}-${option.replace(/\s+/g, '-')}`} className="text-sm font-normal cursor-pointer flex-grow">
                                {option}
                            </Label>
                        </div>
                    ))}
                    {options.length === 0 && <p className="p-2 text-sm text-muted-foreground">No options available for the current filter combination.</p>}
                </ScrollArea>
                 {options.length > 0 && selectedValues.length > 0 && (
                    <div className="p-1 border-t flex justify-end">
                        <Button variant="ghost" size="sm" onClick={() => onSelectionChange([])}>Clear</Button>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    </div>
  );

  const renderFilterAndSummaryCards = (
    currentData: ProcessedIngredientTotalsResult | ProcessedDetailedRawMaterialResult | ProcessedRecipeDataResult | ProcessedComboIngredientsResult | ProcessedChoiceIngredientsResult | null,
    isTabProcessing: boolean
  ) => (
    <>
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center text-xl text-primary">
            <Filter className="mr-2 h-5 w-5" /> Filters & Date Range
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {renderMultiSelectFilter(
              "Site Name", uniqueSiteNames, selectedSiteNames, setSelectedSiteNames,
              "All Sites", "site-filter", !dietData || isLoading || isProcessingOverall || isProcessingDetailedRaw || isProcessingRecipes || isProcessingCombo || isProcessingChoice || isTabProcessing
            )}
             {renderMultiSelectFilter(
              "Class Name", uniqueClassNames, selectedClassNames, setSelectedClassNames,
              "All Classes", "class-filter", !dietData || isLoading || isProcessingOverall || isProcessingDetailedRaw || isProcessingRecipes || isProcessingCombo || isProcessingChoice || isTabProcessing
            )}
            {renderMultiSelectFilter(
              "Species Name (Common)", uniqueSpeciesNames, selectedSpeciesNames, setSelectedSpeciesNames,
              "All Species", "species-filter", !dietData || isLoading || isProcessingOverall || isProcessingDetailedRaw || isProcessingRecipes || isProcessingCombo || isProcessingChoice || isTabProcessing
            )}
            {renderMultiSelectFilter(
              "Meal Time", uniqueMealTimes, selectedMealTimes, setSelectedMealTimes,
              "All Meal Times", "mealtime-filter", !dietData || isLoading || isProcessingOverall || isProcessingDetailedRaw || isProcessingRecipes || isProcessingCombo || isProcessingChoice || isTabProcessing
            )}
          </div>
          <div className="flex flex-col md:flex-row gap-4 md:gap-8 items-start pt-4">
            <div className="flex-1 space-y-1">
              <div className="flex justify-between items-center mb-1">
                 <Label htmlFor="duration-buttons" className="text-sm font-medium">View Totals For:</Label>
                 {(activeTab === "ingredient-totals" || activeTab === "raw-materials") && (
                    <span className="text-xs text-muted-foreground">Excluding Ingredients with Choice.</span>
                 )}
              </div>
              <div id="duration-buttons" className="flex flex-wrap gap-2">
                {getDayOptions(autoDetectedInputDuration)
                  .filter(option => !(autoDetectedInputDuration === 7 && option.value === 1))
                  .map(option => (
                  <Button
                    key={option.value}
                    variant={targetDisplayDuration === option.value ? "default" : "outline"}
                    onClick={() => setTargetDisplayDuration(option.value)}
                    disabled={
                      !dietData || isLoading || isProcessingOverall || isProcessingDetailedRaw || isProcessingRecipes || isProcessingCombo || isProcessingChoice || isTabProcessing ||
                      (autoDetectedInputDuration === 1 && option.value > 1)
                    }
                    className="min-w-[80px] flex-grow sm:flex-grow-0"
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
               {dietData && (
                  <p className="text-xs text-muted-foreground mt-1">
                      Detected input data duration: {autoDetectedInputDuration} day{autoDetectedInputDuration > 1 ? 's' : ''}.
                  </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {dietData && currentData && !(isProcessingOverall || isProcessingDetailedRaw || isProcessingRecipes || isProcessingCombo || isProcessingChoice || isTabProcessing) && (
        <Card className="shadow-md">
           <CardHeader>
              <CardTitle className="text-xl text-primary">Filtered Summary</CardTitle>
            </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <p><span className="font-semibold text-muted-foreground">Total Animals:</span> <span className="font-bold">{currentData.totalAnimals}</span></p>
              <p><span className="font-semibold text-muted-foreground">Total Species:</span> <span className="font-bold">{currentData.totalSpecies}</span></p>
            </div>
          </CardContent>
        </Card>
      )}
       {(isProcessingOverall || isProcessingDetailedRaw || isProcessingRecipes || isProcessingCombo || isProcessingChoice || isTabProcessing) && dietData && (
        <Card className="shadow-md">
            <CardHeader><CardTitle className="text-xl text-primary">Filtered Summary</CardTitle></CardHeader>
            <CardContent className="flex items-center justify-center h-20">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="ml-2 text-muted-foreground">Updating summary...</p>
            </CardContent>
        </Card>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="container mx-auto p-4 md:p-8 space-y-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3 md:grid-cols-6 mb-6">
            <TabsTrigger value="upload">Upload Excel</TabsTrigger>
            <TabsTrigger value="raw-materials" disabled={!dietData}>Raw Materials Required</TabsTrigger>
            <TabsTrigger value="ingredient-totals" disabled={!dietData}>Ingredient Totals</TabsTrigger>
            <TabsTrigger value="recipes" disabled={!dietData}>Recipes</TabsTrigger>
            <TabsTrigger value="combo-ingredients" disabled={!dietData}>Combo Ingredients</TabsTrigger>
            <TabsTrigger value="choice-ingredients" disabled={!dietData}>Choice Ingredients</TabsTrigger>
            {/* <TabsTrigger value="summary" disabled={!dietData}>AI Summary</TabsTrigger> */}
          </TabsList>

          <TabsContent value="upload" className="space-y-6">
            <header className="text-center py-8">
              <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-full mb-4">
                <Leaf className="h-12 w-12 text-primary" />
              </div>
              <h1 className="text-4xl font-bold text-primary tracking-tight">Diet Insights</h1>
              <p className="mt-2 text-lg text-muted-foreground">
                Upload your animal diet plan Excel file to unlock valuable insights.
              </p>
            </header>

            <FileUpload onFileUpload={handleFileUpload} isLoading={isLoading} />

            {isLoading && progress > 0 && (
              <div className="my-4">
                <Progress value={progress} className="w-full h-2" />
                <p className="text-sm text-center text-muted-foreground mt-1">Processing file... {progress}%</p>
              </div>
            )}

            {error && (
              <Alert variant="destructive" className="my-4">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
             {!dietData && !isLoading && !error && (
              <Alert className="my-4">
                <Utensils className="h-4 w-4" />
                <AlertTitle>Welcome to Diet Insights!</AlertTitle>
                <AlertDescription>
                  Please upload an Excel file to begin analyzing your animal diet plans. Once uploaded, you can explore the different tabs for detailed insights.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>

          <TabsContent value="raw-materials" className="space-y-6">
            {renderFilterAndSummaryCards(detailedRawMaterialsData, isProcessingDetailedRaw)}
            <SectionCard
              title={formattedDetailedRawMaterialTitle}
              data={detailedRawMaterialsData?.data}
              columns={detailedRawMaterialColumns}
              viewId="detailed_raw_materials_report"
              isLoading={isProcessingDetailedRaw || isLoading}
            />
          </TabsContent>

          <TabsContent value="ingredient-totals" className="space-y-6">
            {renderFilterAndSummaryCards(overallIngredientsData, isProcessingOverall)}
            <SectionCard
              title={formattedDateRangeTitle}
              data={overallIngredientsData?.data}
              columns={overallIngredientsColumns}
              viewId="ingredient_totals_report"
              isLoading={isProcessingOverall || isLoading}
            />
          </TabsContent>

          <TabsContent value="recipes" className="space-y-6">
            {renderFilterAndSummaryCards(recipesData, isProcessingRecipes)}
            <SectionCard
              title={formattedRecipesTitle}
              viewId="recipes_report"
              isLoading={isProcessingRecipes || isLoading}
              onPdfDownload={handleAllRecipesPdfDownload}
            >
              {(isProcessingRecipes || isLoading) ? (
                <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                  <p>Loading recipe data...</p>
                </div>
              ) : !displayableRecipes || displayableRecipes.length === 0 ? (
                <p className="text-muted-foreground p-4 text-center">No recipe data available based on current filters.</p>
              ) : (
                <div className="space-y-6">
                  {displayableRecipes.map((recipe, index) => {
                    const itemKey = `recipe-${recipe.recipe_name.replace(/\s+/g, '-')}-${index}`;
                    const ingredientsByCut = groupIngredientsByCutSize(recipe.ingredients);
                    return (
                    <Card key={itemKey} className="overflow-hidden shadow-md rounded-lg">
                      <CardHeader className="bg-muted/50 flex flex-row items-center justify-between">
                        <div>
                          <CardTitle className="text-lg font-semibold text-accent">
                            {recipe.recipe_name}{selectedMealTimes.length === 1 ? ` - ${selectedMealTimes[0]}` : ''}
                          </CardTitle>
                          <CardDescription className="text-sm text-foreground space-y-1 mt-1">
                            <div>
                              {autoDetectedInputDuration === 7 ? (
                                <>
                                  Total / Day: {recipe.total_qty_per_day.toFixed(4)} {recipe.base_uom_name} <br />
                                  Total for {targetDisplayDuration} Days: {recipe.total_qty_for_target_duration.toFixed(4)} {recipe.base_uom_name}
                                </>
                              ) : (
                                <>
                                  Total for {targetDisplayDuration} Day{targetDisplayDuration > 1 ? 's' : ''}: {recipe.total_qty_for_target_duration.toFixed(4)} {recipe.base_uom_name}
                                </>
                              )}
                            </div>
                            <div className="flex flex-row flex-wrap items-baseline">
                              <span className="font-semibold whitespace-nowrap mr-1">Consuming Species:</span>
                                <Button
                                    variant="link"
                                    className="p-0 h-auto text-sm text-primary font-bold"
                                    onClick={() => openSpeciesListModal(`Species consuming ${recipe.recipe_name}`, recipe.consuming_species_details)}
                                    disabled={recipe.consuming_species_details.length === 0}
                                >
                                    {recipe.consuming_species_details.length}
                                </Button>
                                {recipe.consuming_species_details.length > 0 && (
                                     <span className={`ml-1 ${!expandedSpeciesText[itemKey] ? "line-clamp-2" : ""}`}>
                                     {formatSpeciesDetails(recipe.consuming_species_details, !expandedSpeciesText[itemKey] ? 10 : undefined)}
                                   </span>
                                )}
                                {recipe.consuming_species_details.length > 10 && (
                                    <Button variant="link" className="p-0 h-auto text-xs ml-1 whitespace-nowrap" onClick={() => toggleSpeciesTextExpansion(itemKey)}>
                                        {expandedSpeciesText[itemKey] ? "(view less)" : "(view more)"}
                                    </Button>
                                )}
                            </div>
                            <div>
                              <span className="font-semibold">Consuming Animals:</span> {recipe.consuming_animals_count}
                            </div>
                             <div>
                                <span className="font-semibold">Scheduled Meal Times: </span>
                                <div className="inline-flex flex-wrap gap-1 items-center">
                                  {recipe.scheduled_meal_times && recipe.scheduled_meal_times.length > 0
                                    ? recipe.scheduled_meal_times.map(time => <Badge key={time} variant="secondary" className="mr-1 mb-1">{time}</Badge>)
                                    : <Badge variant="outline">N/A</Badge>}
                                </div>
                              </div>
                          </CardDescription>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSingleRecipePdfDownload(recipe)}
                          aria-label={`Download PDF for ${recipe.recipe_name}`}
                          disabled={isProcessingRecipes || isLoading || recipe.ingredients.length === 0}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          PDF
                        </Button>
                      </CardHeader>
                      <CardContent className="p-0">
                        {Array.from(ingredientsByCut.entries()).map(([cutSize, ingredientsForCut]) => (
                          <div key={cutSize} className="p-4 border-b last:border-b-0">
                            <h4 className="text-md font-semibold mb-2 text-muted-foreground">Cut Size: {cutSize}</h4>
                            <DataTable
                              columns={recipeIngredientDetailColumns}
                              data={ingredientsForCut}
                            />
                          </div>
                        ))}
                         {recipe.ingredients.length === 0 && <p className="text-muted-foreground p-4 text-center">No ingredients for this recipe.</p>}
                      </CardContent>
                    </Card>
                  )})}
                </div>
              )}
            </SectionCard>
          </TabsContent>

          <TabsContent value="combo-ingredients" className="space-y-6">
            {renderFilterAndSummaryCards(comboIngredientsData, isProcessingCombo)}
            <SectionCard
              title={formattedComboTitle}
              viewId="combo_ingredients_report"
              isLoading={isProcessingCombo || isLoading}
              onPdfDownload={handleAllCombosPdfDownload}
            >
              {(isProcessingCombo || isLoading) ? (
                <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                  <p>Loading combo ingredient data...</p>
                </div>
              ) : !displayableCombos || displayableCombos.length === 0 ? (
                <p className="text-muted-foreground p-4 text-center">No combo ingredient data available based on current filters.</p>
              ) : (
                <div className="space-y-6">
                  {displayableCombos.map((group, index) => {
                     const itemKey = `combo-${group.combo_group_name.replace(/\s+/g, '-')}-${index}`;
                    const ingredientsByCut = groupIngredientsByCutSize(group.ingredients);
                    return (
                    <Card key={itemKey} className="overflow-hidden shadow-md rounded-lg">
                      <CardHeader className="bg-muted/50 flex flex-row items-center justify-between">
                        <div>
                          <CardTitle className="text-lg font-semibold text-accent">
                            {group.combo_group_name}{selectedMealTimes.length === 1 ? ` - ${selectedMealTimes[0]}` : ''}
                          </CardTitle>
                          <CardDescription className="text-sm text-foreground space-y-1 mt-1">
                            <div>
                              {autoDetectedInputDuration === 7 ? (
                                <>
                                  Total / Day: {group.total_qty_per_day.toFixed(4)} {group.base_uom_name} <br />
                                  Total for {targetDisplayDuration} Days: {group.total_qty_for_target_duration.toFixed(4)} {group.base_uom_name}
                                </>
                              ) : (
                                <>
                                  Total for {targetDisplayDuration} Day{targetDisplayDuration > 1 ? 's' : ''}: {group.total_qty_for_target_duration.toFixed(4)} {group.base_uom_name}
                                </>
                              )}
                            </div>
                           <div className="flex flex-row flex-wrap items-baseline">
                              <span className="font-semibold whitespace-nowrap mr-1">Consuming Species:</span>
                                <Button
                                    variant="link"
                                    className="p-0 h-auto text-sm text-primary font-bold"
                                    onClick={() => openSpeciesListModal(`Species consuming ${group.combo_group_name}`, group.consuming_species_details)}
                                    disabled={group.consuming_species_details.length === 0}
                                >
                                    {group.consuming_species_details.length}
                                </Button>
                                {group.consuming_species_details.length > 0 && (
                                    <span className={`ml-1 ${!expandedSpeciesText[itemKey] ? "line-clamp-2" : ""}`}>
                                      {formatSpeciesDetails(group.consuming_species_details, !expandedSpeciesText[itemKey] ? 10 : undefined)}
                                    </span>
                                )}
                                {group.consuming_species_details.length > 10 && (
                                    <Button variant="link" className="p-0 h-auto text-xs ml-1 whitespace-nowrap" onClick={() => toggleSpeciesTextExpansion(itemKey)}>
                                        {expandedSpeciesText[itemKey] ? "(view less)" : "(view more)"}
                                    </Button>
                                )}
                              </div>
                            <div>
                              <span className="font-semibold">Consuming Animals:</span> {group.consuming_animals_count}
                            </div>
                             <div>
                                <span className="font-semibold">Scheduled Meal Times: </span>
                                <div className="inline-flex flex-wrap gap-1 items-center">
                                {group.scheduled_meal_times && group.scheduled_meal_times.length > 0
                                  ? group.scheduled_meal_times.map(time => <Badge key={time} variant="secondary" className="mr-1 mb-1">{time}</Badge>)
                                  : <Badge variant="outline">N/A</Badge>}
                                </div>
                              </div>
                          </CardDescription>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSingleComboPdfDownload(group)}
                          aria-label={`Download PDF for ${group.combo_group_name}`}
                          disabled={isProcessingCombo || isLoading || group.ingredients.length === 0}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          PDF
                        </Button>
                      </CardHeader>
                      <CardContent className="p-0">
                        {Array.from(ingredientsByCut.entries()).map(([cutSize, ingredientsForCut]) => (
                          <div key={cutSize} className="p-4 border-b last:border-b-0">
                            <h4 className="text-md font-semibold mb-2 text-muted-foreground">Cut Size: {cutSize}</h4>
                            <DataTable
                              columns={comboIngredientDetailColumns}
                              data={ingredientsForCut}
                            />
                          </div>
                        ))}
                        {group.ingredients.length === 0 && <p className="text-muted-foreground p-4 text-center">No ingredients for this combo group.</p>}
                      </CardContent>
                    </Card>
                  )})}
                </div>
              )}
            </SectionCard>
          </TabsContent>

          <TabsContent value="choice-ingredients" className="space-y-6">
            {renderFilterAndSummaryCards(choiceIngredientsData, isProcessingChoice)}
            <SectionCard
              title={formattedChoiceTitle}
              viewId="choice_ingredients_report"
              isLoading={isProcessingChoice || isLoading}
              onPdfDownload={handleAllChoicesPdfDownload}
            >
              {(isProcessingChoice || isLoading) ? (
                <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                  <p>Loading choice ingredient data...</p>
                </div>
              ) : !displayableChoices || displayableChoices.length === 0 ? (
                <p className="text-muted-foreground p-4 text-center">No choice ingredient data available based on current filters.</p>
              ) : (
                <div className="space-y-6">
                  {displayableChoices.map((group, index) => {
                    const itemKey = `choice-${group.choice_group_name.replace(/\s+/g, '-')}-${index}`;
                    const ingredientsByCut = groupIngredientsByCutSize(group.ingredients);
                    return (
                    <Card key={itemKey} className="overflow-hidden shadow-md rounded-lg">
                      <CardHeader className="bg-muted/50 flex flex-row items-center justify-between">
                        <div>
                          <CardTitle className="text-lg font-semibold text-accent">
                            {group.choice_group_name}{selectedMealTimes.length === 1 ? ` - ${selectedMealTimes[0]}` : ''}
                          </CardTitle>
                          <CardDescription className="text-sm text-foreground space-y-1 mt-1">
                            <div>
                              {autoDetectedInputDuration === 7 ? (
                                <>
                                  Total / Day: {group.total_qty_per_day.toFixed(4)} {group.base_uom_name} <br />
                                  Total for {targetDisplayDuration} Days: {group.total_qty_for_target_duration.toFixed(4)} {group.base_uom_name}
                                </>
                              ) : (
                                <>
                                  Total for {targetDisplayDuration} Day{targetDisplayDuration > 1 ? 's' : ''}: {group.total_qty_for_target_duration.toFixed(4)} {group.base_uom_name}
                                </>
                              )}
                            </div>
                            <div className="flex flex-row flex-wrap items-baseline">
                                <span className="font-semibold whitespace-nowrap mr-1">Consuming Species:</span>
                                <Button
                                    variant="link"
                                    className="p-0 h-auto text-sm text-primary font-bold"
                                    onClick={() => openSpeciesListModal(`Species consuming ${group.choice_group_name}`, group.consuming_species_details)}
                                    disabled={group.consuming_species_details.length === 0}
                                >
                                    {group.consuming_species_details.length}
                                </Button>
                                {group.consuming_species_details.length > 0 && (
                                    <span className={`ml-1 ${!expandedSpeciesText[itemKey] ? "line-clamp-2" : ""}`}>
                                      {formatSpeciesDetails(group.consuming_species_details, !expandedSpeciesText[itemKey] ? 10 : undefined)}
                                    </span>
                                )}
                                {group.consuming_species_details.length > 10 && (
                                    <Button variant="link" className="p-0 h-auto text-xs ml-1 whitespace-nowrap" onClick={() => toggleSpeciesTextExpansion(itemKey)}>
                                        {expandedSpeciesText[itemKey] ? "(view less)" : "(view more)"}
                                    </Button>
                                )}
                              </div>
                            <div>
                              <span className="font-semibold">Consuming Animals:</span> {group.consuming_animals_count}
                            </div>
                             <div>
                                <span className="font-semibold">Scheduled Meal Times: </span>
                                <div className="inline-flex flex-wrap gap-1 items-center">
                                {group.scheduled_meal_times && group.scheduled_meal_times.length > 0
                                  ? group.scheduled_meal_times.map(time => <Badge key={time} variant="secondary" className="mr-1 mb-1">{time}</Badge>)
                                  : <Badge variant="outline">N/A</Badge>}
                                </div>
                              </div>
                          </CardDescription>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSingleChoicePdfDownload(group)}
                          aria-label={`Download PDF for ${group.choice_group_name}`}
                          disabled={isProcessingChoice || isLoading || group.ingredients.length === 0}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          PDF
                        </Button>
                      </CardHeader>
                      <CardContent className="p-0">
                         {Array.from(ingredientsByCut.entries()).map(([cutSize, ingredientsForCut]) => (
                          <div key={cutSize} className="p-4 border-b last:border-b-0">
                            <h4 className="text-md font-semibold mb-2 text-muted-foreground">Cut Size: {cutSize}</h4>
                            <DataTable
                              columns={choiceIngredientDetailColumns}
                              data={ingredientsForCut}
                            />
                          </div>
                        ))}
                        {group.ingredients.length === 0 && <p className="text-muted-foreground p-4 text-center">No ingredients for this choice group.</p>}
                      </CardContent>
                    </Card>
                  )})}
                </div>
              )}
            </SectionCard>
          </TabsContent>

          {/*
          <TabsContent value="summary" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-xl text-primary">
                  <Sparkles className="mr-2 h-5 w-5" /> AI Diet Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                 <Button
                  onClick={handleGenerateSummary}
                  disabled={isGeneratingSummary || !dietData || isProcessingOverall || isProcessingRecipes || isProcessingCombo || isProcessingChoice}
                >
                  {isGeneratingSummary ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...</>
                  ) : (
                    <><Sparkles className="mr-2 h-4 w-4" /> Generate Summary</>
                  )}
                </Button>

                {isGeneratingSummary && (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="ml-2 text-muted-foreground">AI is thinking...</p>
                  </div>
                )}

                {summaryError && (
                  <Alert variant="destructive">
                    <AlertTitle>Error Generating Summary</AlertTitle>
                    <AlertDescription>{summaryError}</AlertDescription>
                  </Alert>
                )}

                {aiSummary && !isGeneratingSummary && (
                  <Card className="bg-muted/30 p-4">
                    <CardContent>
                      <h3 className="text-lg font-semibold mb-2 text-accent">Diet Plan Insights:</h3>
                      <div
                        className="prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: aiSummary.replace(/\n/g, '<br />') }}
                      />
                    </CardContent>
                  </Card>
                )}
                 {!aiSummary && !isGeneratingSummary && !summaryError && dietData && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>Ready for Insights?</AlertTitle>
                    <AlertDescription>
                      Click the "Generate Summary" button to get an AI-powered overview of your diet plan based on the current filters and data.
                    </AlertDescription>
                  </Alert>
                )}
                {!dietData && !isLoading && (
                   <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>No Data Uploaded</AlertTitle>
                    <AlertDescription>
                      Please upload an Excel file first to enable AI summary generation.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          */}

        </Tabs>

        {/* Species List Modal Dialog */}
        <Dialog open={isSpeciesListModalOpen} onOpenChange={setIsSpeciesListModalOpen}>
          <DialogContent className="sm:max-w-md md:max-w-lg">
            <DialogHeader>
              <DialogTitle>{speciesListModalTitle}</DialogTitle>
              <DialogDescription>
                List of unique species consuming this item, with animal counts.
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="h-[300px] w-full rounded-md border p-4 my-4">
              {speciesListForModal.length > 0 ? (
                speciesListForModal.map((detail, idx) => (
                  <div key={idx} className="py-1 text-sm border-b last:border-b-0">
                    {detail.name} ({detail.animal_count})
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No specific species recorded for this item.</p>
              )}
            </ScrollArea>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Close</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </main>
      <footer className="text-center py-6 mt-auto border-t">
        <p className="text-sm text-muted-foreground">
          Diet Insights &copy; {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
}

