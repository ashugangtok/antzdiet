
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
  DietEntry, SiteIngredientsData, ColumnDefinition, DetailedRawMaterialData, GroupedByTypeIngredient,
  ProcessedIngredientTotalsResult, ProcessedDetailedRawMaterialResult,
  ProcessedRecipeDataResult, RecipeIngredientItem, GroupedRecipe,
  ProcessedComboIngredientsResult, GroupedComboIngredient, ComboIngredientItem,
  ProcessedChoiceIngredientsResult, GroupedChoiceIngredient, ChoiceIngredientItem, SpeciesConsumptionDetail
} from '@/types';
import {
  parseExcelFile, processOverallIngredientTotals, processDetailedRawMaterialTotals, processRecipeData,
  processComboIngredientUsage, getUniqueSiteNames,
  getUniqueSpeciesNames,
  getUniqueClassNames,
  getUniqueMealTimes,
  processChoiceIngredientUsage,
  applyGlobalFilters, getGlobalCounts, getDynamicUniqueFilterOptions
} from '@/lib/excelParser';
import { Leaf, Utensils, Filter, Loader2, ChevronsUpDown, Download, Info, Table as TableIcon } from 'lucide-react';
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
        // "1 Day" will be hidden if input is 7 days
        return options.filter(opt => opt.value !== 1);
    } else {
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
  const [isLoading, setIsLoading] = useState(false);

  const [isProcessingOverall, setIsProcessingOverall] = useState(false);
  const [isProcessingDetailedRaw, setIsProcessingDetailedRaw] = useState(false);
  const [isProcessingRecipes, setIsProcessingRecipes] = useState(false);
  const [isProcessingCombo, setIsProcessingCombo] = useState(false);
  const [isProcessingChoice, setIsProcessingChoice] = useState(false);


  const [progress, setProgress] = useState(0);
  const [activeTab, setActiveTab] = useState("upload");

  const [allSiteNames, setAllSiteNames] = useState<string[]>([]);
  const [allSpeciesNames, setAllSpeciesNames] = useState<string[]>([]);
  const [allClassNames, setAllClassNames] = useState<string[]>([]);
  const [allMealTimes, setAllMealTimes] = useState<string[]>([]);

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

  const [isAnimalListModalOpen, setIsAnimalListModalOpen] = useState(false);
  const [animalListModalTitle, setAnimalListModalTitle] = useState('');
  const [animalListForModal, setAnimalListForModal] = useState<string[]>([]);

  const [isEnclosureListModalOpen, setIsEnclosureListModalOpen] = useState(false);
  const [enclosureListModalTitle, setEnclosureListModalTitle] = useState('');
  const [enclosureListForModal, setEnclosureListForModal] = useState<string[]>([]);

  const [expandedSpeciesText, setExpandedSpeciesText] = useState<Record<string, boolean>>({});


  // const [aiSummary, setAiSummary] = useState<string | null>(null);
  // const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  // const [summaryError, setSummaryError] = useState<string | null>(null);

  const openSpeciesListModal = (title: string, details: SpeciesConsumptionDetail[]) => {
    setSpeciesListModalTitle(title);
    setSpeciesListForModal(details);
    setIsSpeciesListModalOpen(true);
  };

  const openAnimalListModal = (title: string, animalIds: string[]) => {
    setAnimalListModalTitle(title);
    setAnimalListForModal(animalIds);
    setIsAnimalListModalOpen(true);
  };

  const openEnclosureListModal = (title: string, enclosureNames: string[]) => {
    setEnclosureListModalTitle(title);
    setEnclosureListForModal(enclosureNames);
    setIsEnclosureListModalOpen(true);
  };

  const toggleSpeciesTextExpansion = (itemId: string) => {
    setExpandedSpeciesText(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const formatSpeciesDetails = (details: SpeciesConsumptionDetail[], limit?: number): string => {
    if (!details || details.length === 0) return "";
    const toFormat = limit && details.length > limit && limit > 0 ? details.slice(0, limit) : details;
    let formattedString = `(${toFormat.map(d => `${d.name} (${d.animal_count})`).join(', ')}`;
    formattedString += ')';
    return formattedString;
  };


 const detailedRawMaterialColumns = useMemo((): ColumnDefinition<DetailedRawMaterialData>[] => {
    return [
      { key: 'ingredient_name', header: 'Ingredient Name' },
      { key: 'qty_per_day', header: 'Qty / Day', cell: (item) => item.qty_per_day.toFixed(2) },
      { key: 'base_uom_name', header: 'Base UOM' },
    ];
  }, []);

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

    // Reset target display duration based on default 1-day input detection
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
      setDietData(parsedData); // Store the original full dataset
      setAutoDetectedInputDuration(detectedInputDuration);
      setExcelMinDate(minDate);
      setExcelMaxDate(maxDate);

      // Set ALL possible filter options initially from the full dataset
      setAllSiteNames(getUniqueSiteNames(parsedData));
      setAllSpeciesNames(getUniqueSpeciesNames(parsedData));
      setAllClassNames(getUniqueClassNames(parsedData));
      setAllMealTimes(getUniqueMealTimes(parsedData));
      
      // Initialize unique filter options with all possible values from the uploaded file
      setUniqueSiteNames(getUniqueSiteNames(parsedData));
      setUniqueSpeciesNames(getUniqueSpeciesNames(parsedData));
      setUniqueClassNames(getUniqueClassNames(parsedData));
      setUniqueMealTimes(getUniqueMealTimes(parsedData));


      // Adjust targetDisplayDuration based on detectedInputDuration
      const currentDayOptions = getDayOptions(detectedInputDuration);
      let newTargetDuration = targetDisplayDuration; // Keep current if valid

      if (!currentDayOptions.some(opt => opt.value === newTargetDuration)) {
         // If current target duration is not valid for the new input type (e.g., was 1, now 7-day input hides 1 day option)
         // or if the new input type makes the old target invalid (e.g. input is 1-day, target was 7)
        newTargetDuration = currentDayOptions[0]?.value || (detectedInputDuration === 7 ? 7 : 1);
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
             setActiveTab("raw-materials"); 
        }
      }, 500);
    }
  }, [targetDisplayDuration]); // Keep targetDisplayDuration dependency if you want it to influence default on new upload

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
          dietData, // Pass original for consumer details
          globallyFilteredData, globalCounts.totalAnimals, globalCounts.totalSpecies,
          autoDetectedInputDuration, targetDisplayDuration
        );
        setOverallIngredientsData(overallResult);
      } catch (processingError) {
        console.error("Error processing overall ingredients:", processingError);
        setError(prev => prev ? `${prev}\nOverall: ${processingError instanceof Error ? processingError.message : String(processingError)}` : `Overall: ${processingError instanceof Error ? processingError.message : String(processingError)}`);
        setOverallIngredientsData(null);
      } finally {
        setIsProcessingOverall(false);
      }

      try {
        const detailedRawResult = processDetailedRawMaterialTotals(
          globallyFilteredData, globalCounts.totalAnimals, globalCounts.totalSpecies,
          autoDetectedInputDuration
        );
        setDetailedRawMaterialsData(detailedRawResult);
      } catch (processingError) {
        console.error("Error processing detailed raw materials:", processingError);
        setError(prev => prev ? `${prev}\nDetailed Raw: ${processingError instanceof Error ? processingError.message : String(processingError)}` : `Detailed Raw: ${processingError instanceof Error ? processingError.message : String(processingError)}`);
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
        console.error("Error processing recipes:", processingError);
        setError(prev => prev ? `${prev}\nRecipes: ${processingError instanceof Error ? processingError.message : String(processingError)}` : `Recipes: ${processingError instanceof Error ? processingError.message : String(processingError)}`);
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
        console.error("Error processing combo ingredients:", processingError);
        setError(prev => prev ? `${prev}\nCombo: ${processingError instanceof Error ? processingError.message : String(processingError)}` : `Combo: ${processingError instanceof Error ? processingError.message : String(processingError)}`);
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
        console.error("Error processing choice ingredients:", processingError);
        setError(prev => prev ? `${prev}\nChoice: ${processingError instanceof Error ? processingError.message : String(processingError)}` : `Choice: ${processingError instanceof Error ? processingError.message : String(processingError)}`);
        setChoiceIngredientsData(null);
      } finally {
        setIsProcessingChoice(false);
      }
    };

    processAllData();
  }, [dietData, selectedSiteNames, selectedSpeciesNames, selectedClassNames, selectedMealTimes, autoDetectedInputDuration, targetDisplayDuration]);


  useEffect(() => {
    if (!dietData) {
      setUniqueSiteNames(allSiteNames);
      setUniqueClassNames(allClassNames);
      setUniqueSpeciesNames(allSpeciesNames);
      setUniqueMealTimes(allMealTimes);
      return;
    }
    const currentFilters = {
        siteNames: selectedSiteNames,
        classNames: selectedClassNames,
        speciesNames: selectedSpeciesNames,
        mealTimes: selectedMealTimes,
    };

    setUniqueSiteNames(getDynamicUniqueFilterOptions(dietData, 'site_name', currentFilters));
    setUniqueClassNames(getDynamicUniqueFilterOptions(dietData, 'class_name', currentFilters));
    setUniqueSpeciesNames(getDynamicUniqueFilterOptions(dietData, 'common_name', currentFilters));
    setUniqueMealTimes(getDynamicUniqueFilterOptions(dietData, 'meal_time', currentFilters));

  }, [dietData, selectedSiteNames, selectedClassNames, selectedSpeciesNames, selectedMealTimes, allSiteNames, allClassNames, allSpeciesNames, allMealTimes]);


  const formattedIngredientTotalsTitle = useMemo(() => {
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


  const displayableIngredientTotals = useMemo(() =>
    (overallIngredientsData?.data?.filter(group => group.ingredients.length > 0)) || [],
  [overallIngredientsData]);

  const displayableRecipes = useMemo(() =>
    (recipesData?.data?.filter(recipe => recipe.ingredients.length > 0)) || [],
  [recipesData]);

  const displayableCombos = useMemo(() =>
    (comboIngredientsData?.data?.filter(group => group.ingredients.length > 0)) || [],
  [comboIngredientsData]);

  const displayableChoices = useMemo(() =>
    (choiceIngredientsData?.data?.filter(group => group.ingredients.length > 0)) || [],
  [choiceIngredientsData]);


  const handleAllTypeIngredientsPdfDownload = () => {
    if (!displayableIngredientTotals || displayableIngredientTotals.length === 0) {
      alert("No ingredient types with items to download based on current filters.");
      return;
    }
    const doc = new jsPDF();
    let currentY = 15;
    doc.setFontSize(16);
    doc.text(formattedIngredientTotalsTitle, 14, currentY);
    currentY += 8;

    displayableIngredientTotals.forEach((typeGroup, index) => {
      if (index > 0 && (currentY + 70 > doc.internal.pageSize.getHeight() - 20)) { // Check for page break
        doc.addPage(); currentY = 15; doc.setFontSize(16);
        doc.text(formattedIngredientTotalsTitle + " (cont.)", 14, currentY); currentY += 8;
      } else if (index > 0) {
        currentY += 10; // Space between groups
      }

      doc.setFontSize(12);
      let groupTitle = typeGroup.ingredient_type_name;
       if (selectedMealTimes.length === 1) {
         groupTitle += ` - ${selectedMealTimes[0]}`;
       }
      doc.text(groupTitle, 14, currentY); currentY += 6;
      doc.setFontSize(8);

      let totalQtyText = "Total for " + targetDisplayDuration + " Day(s): ";
      const uomTotalsCombined = Object.entries(typeGroup.total_quantities_for_target_duration)
                                   .map(([uom, qty]) => `${qty.toFixed(2)} ${uom}`)
                                   .join(', ');
      doc.text(totalQtyText + (uomTotalsCombined || "N/A"), 14, currentY); currentY +=4;

      const speciesText = `Consuming Species: ${typeGroup.overall_consuming_species_details.length} ${formatSpeciesDetails(typeGroup.overall_consuming_species_details)}`;
      const splitSpeciesText = doc.splitTextToSize(speciesText, doc.internal.pageSize.getWidth() - 28);
      doc.text(splitSpeciesText, 14, currentY); currentY += (splitSpeciesText.length * 3.5) + 2;

      doc.text(`Consuming Animals: ${typeGroup.overall_consuming_animals_count}`, 14, currentY); currentY += 4;
      doc.text(`Consuming Enclosures: ${typeGroup.overall_consuming_enclosures_count}`, 14, currentY); currentY += 4;
      
      const scheduledTimesString = typeGroup.scheduled_meal_times.length > 0 ? typeGroup.scheduled_meal_times.map(t => t.trim()).filter(Boolean).join(', ') : 'N/A';
      const mealTimesText = `Scheduled Meal Times: ${scheduledTimesString}`;
      const splitMealTimesText = doc.splitTextToSize(mealTimesText, doc.internal.pageSize.getWidth() - 28);
      doc.text(splitMealTimesText, 14, currentY); currentY += (splitMealTimesText.length * 3.5) + 2;


      // Ingredient Table
      const ingredientTableColumns = [
        { header: "Ingredient Name", dataKey: "ingredient_name" },
        { header: "Prep Type", dataKey: "preparation_type_name" },
        { header: "Cut Size", dataKey: "cut_size_name" },
        { header: "Base UOM", dataKey: "base_uom_name" },
      ];
      typeGroup.group_specific_meal_times.forEach(mt => {
        ingredientTableColumns.push({ header: `${mt} Qty`, dataKey: `qty_${mt}` });
      });

      const ingredientTableRows = typeGroup.ingredients.map(ing => {
        const row: any = {
          ingredient_name: ing.ingredient_name,
          preparation_type_name: ing.preparation_type_name || 'N/A',
          cut_size_name: ing.cut_size_name || 'N/A',
          base_uom_name: ing.base_uom_name,
        };
        typeGroup.group_specific_meal_times.forEach(mt => {
          row[`qty_${mt}`] = ing.quantities_by_meal_time[mt]?.toFixed(2) === '0.00' ? '' : ing.quantities_by_meal_time[mt]?.toFixed(2) || '';
        });
        return row;
      });

      (doc as any).autoTable({
        columns: ingredientTableColumns,
        body: ingredientTableRows,
        startY: currentY,
        theme: 'striped',
        headStyles: { fillColor: [75, 85, 99] },
        styles: { fontSize: 7, cellPadding: 1 },
      });
      currentY = (doc as any).lastAutoTable.finalY + 3;

      // Summary Table
      const summaryTableBody: any[] = [];
      const uomTotalsForFooter: Record<string, Record<string, number>> = {};
      typeGroup.group_specific_meal_times.forEach(mt => {
        uomTotalsForFooter[mt] = {};
        typeGroup.ingredients.forEach(ing => {
          const qty = ing.quantities_by_meal_time[mt] || 0;
          uomTotalsForFooter[mt][ing.base_uom_name] = (uomTotalsForFooter[mt][ing.base_uom_name] || 0) + qty;
        });
      });
      
      const allUOMs = Array.from(new Set(typeGroup.ingredients.map(i => i.base_uom_name))).sort();
      allUOMs.forEach(uom => {
          const uomRow: any = { metric: `Total Qty Required (${uom}):` };
          typeGroup.group_specific_meal_times.forEach(mt => {
              uomRow[mt] = uomTotalsForFooter[mt]?.[uom]?.toFixed(2) === '0.00' ? '' : uomTotalsForFooter[mt]?.[uom]?.toFixed(2) || '';
          });
          summaryTableBody.push(uomRow);
      });
      
      const animalRow: any = { metric: "# of Animals" };
      typeGroup.group_specific_meal_times.forEach(mt => { animalRow[mt] = (typeGroup.animals_per_meal_time[mt] || []).length.toString(); });
      summaryTableBody.push(animalRow);

      const speciesRow: any = { metric: "# of Species" };
      typeGroup.group_specific_meal_times.forEach(mt => { speciesRow[mt] = (typeGroup.species_details_per_meal_time[mt] || []).length.toString(); });
      summaryTableBody.push(speciesRow);

      const enclosureRow: any = { metric: "# of Enclosures" };
      typeGroup.group_specific_meal_times.forEach(mt => { enclosureRow[mt] = (typeGroup.enclosures_per_meal_time[mt] || []).length.toString(); });
      summaryTableBody.push(enclosureRow);
      
      const summaryTableColumns = [{ header: "Time Slot", dataKey: "metric" }];
      typeGroup.group_specific_meal_times.forEach(mt => {
          summaryTableColumns.push({header: mt, dataKey: mt});
      });

      (doc as any).autoTable({
        columns: summaryTableColumns,
        body: summaryTableBody,
        startY: currentY,
        theme: 'grid',
        headStyles: { fillColor: [100, 116, 139], textColor: 255 },
        styles: { fontSize: 7, cellPadding: 1 },
        columnStyles: { metric: { fontStyle: 'bold'}},
      });
      currentY = (doc as any).lastAutoTable.finalY + 5;
    });
    doc.save('all_ingredient_totals_report.pdf');
  };

  const handleSingleTypeIngredientPdfDownload = (typeGroup: GroupedByTypeIngredient) => {
     if (!typeGroup || typeGroup.ingredients.length === 0) {
      alert("No ingredient data for this type to download.");
      return;
    }
    const doc = new jsPDF();
    let currentY = 15;
    doc.setFontSize(16);
    let groupTitle = typeGroup.ingredient_type_name;
     if (selectedMealTimes.length === 1) {
       groupTitle += ` - ${selectedMealTimes[0]}`;
     }
    doc.text(groupTitle, 14, currentY); currentY += 8;
    doc.setFontSize(8);

    let totalQtyText = "Total for " + targetDisplayDuration + " Day(s): ";
    const uomTotalsCombined = Object.entries(typeGroup.total_quantities_for_target_duration)
                                 .map(([uom, qty]) => `${qty.toFixed(2)} ${uom}`)
                                 .join(', ');
    doc.text(totalQtyText + (uomTotalsCombined || "N/A"), 14, currentY); currentY +=4;
    
    const speciesText = `Consuming Species: ${typeGroup.overall_consuming_species_details.length} ${formatSpeciesDetails(typeGroup.overall_consuming_species_details)}`;
    const splitSpeciesText = doc.splitTextToSize(speciesText, doc.internal.pageSize.getWidth() - 28);
    doc.text(splitSpeciesText, 14, currentY); currentY += (splitSpeciesText.length * 3.5) + 2;

    doc.text(`Consuming Animals: ${typeGroup.overall_consuming_animals_count}`, 14, currentY); currentY += 4;
    doc.text(`Consuming Enclosures: ${typeGroup.overall_consuming_enclosures_count}`, 14, currentY); currentY += 4;
    
    const scheduledTimesString = typeGroup.scheduled_meal_times.length > 0 ? typeGroup.scheduled_meal_times.map(t => t.trim()).filter(Boolean).join(', ') : 'N/A';
    const mealTimesText = `Scheduled Meal Times: ${scheduledTimesString}`;
    const splitMealTimesText = doc.splitTextToSize(mealTimesText, doc.internal.pageSize.getWidth() - 28);
    doc.text(splitMealTimesText, 14, currentY); currentY += (splitMealTimesText.length * 3.5) + 2;

    // Ingredient Table
    const ingredientTableColumns = [
      { header: "Ingredient Name", dataKey: "ingredient_name" },
      { header: "Prep Type", dataKey: "preparation_type_name" },
      { header: "Cut Size", dataKey: "cut_size_name" },
      { header: "Base UOM", dataKey: "base_uom_name" },
    ];
    typeGroup.group_specific_meal_times.forEach(mt => {
      ingredientTableColumns.push({ header: `${mt} Qty`, dataKey: `qty_${mt}` });
    });

    const ingredientTableRows = typeGroup.ingredients.map(ing => {
      const row: any = {
        ingredient_name: ing.ingredient_name,
        preparation_type_name: ing.preparation_type_name || 'N/A',
        cut_size_name: ing.cut_size_name || 'N/A',
        base_uom_name: ing.base_uom_name,
      };
      typeGroup.group_specific_meal_times.forEach(mt => {
        row[`qty_${mt}`] = ing.quantities_by_meal_time[mt]?.toFixed(2) === '0.00' ? '' : ing.quantities_by_meal_time[mt]?.toFixed(2) || '';
      });
      return row;
    });

    (doc as any).autoTable({
      columns: ingredientTableColumns,
      body: ingredientTableRows,
      startY: currentY,
      theme: 'striped',
      headStyles: { fillColor: [75, 85, 99] },
      styles: { fontSize: 7, cellPadding: 1 },
    });
    currentY = (doc as any).lastAutoTable.finalY + 3;

    // Summary Table
    const summaryTableBody: any[] = [];
    const uomTotalsForFooter: Record<string, Record<string, number>> = {};
      typeGroup.group_specific_meal_times.forEach(mt => {
        uomTotalsForFooter[mt] = {};
        typeGroup.ingredients.forEach(ing => {
          const qty = ing.quantities_by_meal_time[mt] || 0;
          uomTotalsForFooter[mt][ing.base_uom_name] = (uomTotalsForFooter[mt][ing.base_uom_name] || 0) + qty;
        });
      });
      
    const allUOMs = Array.from(new Set(typeGroup.ingredients.map(i => i.base_uom_name))).sort();
    allUOMs.forEach(uom => {
        const uomRow: any = { metric: `Total Qty Required (${uom}):` };
        typeGroup.group_specific_meal_times.forEach(mt => {
            uomRow[mt] = uomTotalsForFooter[mt]?.[uom]?.toFixed(2) === '0.00' ? '' : uomTotalsForFooter[mt]?.[uom]?.toFixed(2) || '';
        });
        summaryTableBody.push(uomRow);
    });
      
    const animalRow: any = { metric: "# of Animals" };
    typeGroup.group_specific_meal_times.forEach(mt => { animalRow[mt] = (typeGroup.animals_per_meal_time[mt] || []).length.toString(); });
    summaryTableBody.push(animalRow);

    const speciesRow: any = { metric: "# of Species" };
    typeGroup.group_specific_meal_times.forEach(mt => { speciesRow[mt] = (typeGroup.species_details_per_meal_time[mt] || []).length.toString(); });
    summaryTableBody.push(speciesRow);

    const enclosureRow: any = { metric: "# of Enclosures" };
    typeGroup.group_specific_meal_times.forEach(mt => { enclosureRow[mt] = (typeGroup.enclosures_per_meal_time[mt] || []).length.toString(); });
    summaryTableBody.push(enclosureRow);
      
    const summaryTableColumns = [{ header: "Time Slot", dataKey: "metric" }];
    typeGroup.group_specific_meal_times.forEach(mt => {
        summaryTableColumns.push({header: mt, dataKey: mt});
    });

    (doc as any).autoTable({
      columns: summaryTableColumns,
      body: summaryTableBody,
      startY: currentY,
      theme: 'grid',
      headStyles: { fillColor: [100, 116, 139], textColor: 255 },
      styles: { fontSize: 7, cellPadding: 1 },
      columnStyles: { metric: { fontStyle: 'bold'}},
    });
    
    doc.save(`IngredientType_${typeGroup.ingredient_type_name.replace(/\s+/g, '_')}_${targetDisplayDuration}Days.pdf`);
  };


  const handleAllRecipesPdfDownload = () => {
     if (!displayableRecipes || displayableRecipes.length === 0) {
      alert("No recipes with ingredients to download based on current filters.");
      return;
    }

    const doc = new jsPDF();
    let currentY = 15; // Initial Y position for the first recipe
    doc.setFontSize(16);
    doc.text(formattedRecipesTitle, 14, currentY);
    currentY += 7; // Space after main title

    displayableRecipes.forEach((recipe, index) => {
      if (index > 0) { 
        currentY += 10;
      }

      let estimatedRecipeHeight = 60 + (formatSpeciesDetails(recipe.overall_consuming_species_details).length / 50 * 4);
      recipe.group_specific_meal_times.forEach(() => estimatedRecipeHeight += 10); 
      let totalIngredientRows = recipe.ingredients.length;
      estimatedRecipeHeight += totalIngredientRows * 7; 
      estimatedRecipeHeight += 25; // for summary rows

      if (currentY + estimatedRecipeHeight > doc.internal.pageSize.getHeight() - 20 && index > 0) { 
        doc.addPage();
        currentY = 15; 
        doc.setFontSize(16);
        doc.text(formattedRecipesTitle + " (cont.)", 14, currentY);
        currentY += 7;
      }

      doc.setFontSize(12);
      let recipeTitle = recipe.recipe_name;
      if (selectedMealTimes.length === 1) {
        recipeTitle += ` - ${selectedMealTimes[0]}`;
      }
      doc.text(recipeTitle, 14, currentY);
      currentY += 6;
      doc.setFontSize(8);

      let totalQtyText = "";
      if (autoDetectedInputDuration === 7) {
        totalQtyText = `Total / Day: ${recipe.total_qty_per_day.toFixed(4)} ${recipe.base_uom_name}  |  Total for ${targetDisplayDuration} Days: ${recipe.total_qty_for_target_duration.toFixed(4)} ${recipe.base_uom_name}`;
      } else {
        totalQtyText = `Total for ${targetDisplayDuration} Day${targetDisplayDuration > 1 ? 's' : ''}: ${recipe.total_qty_for_target_duration.toFixed(4)} ${recipe.base_uom_name}`;
      }
      doc.text(totalQtyText, 14, currentY);
      currentY += 4;

      const speciesText = `Consuming Species: ${recipe.overall_consuming_species_details.length} ${formatSpeciesDetails(recipe.overall_consuming_species_details)}`;
      const splitSpeciesText = doc.splitTextToSize(speciesText, doc.internal.pageSize.getWidth() - 28);
      doc.text(splitSpeciesText, 14, currentY);
      currentY += (splitSpeciesText.length * 3.5) + 2;

      doc.text(`Consuming Animals: ${recipe.overall_consuming_animals_count}`, 14, currentY);
      currentY += 4;
      doc.text(`Consuming Enclosures: ${recipe.overall_consuming_enclosures_count}`, 14, currentY);
      currentY += 4;

      const scheduledTimesString = recipe.scheduled_meal_times.length > 0 ? recipe.scheduled_meal_times.map(t => t.trim()).filter(Boolean).join(', ') : 'N/A';
      const mealTimesText = `Scheduled Meal Times: ${scheduledTimesString}`;
      const splitMealTimesText = doc.splitTextToSize(mealTimesText, doc.internal.pageSize.getWidth() - 28);
      doc.text(splitMealTimesText, 14, currentY);
      currentY += (splitMealTimesText.length * 3.5) + 2;

      const ingredientTableColumns = [
        { header: "Ingredient Name", dataKey: "ingredient_name" },
        { header: "Prep Type", dataKey: "preparation_type_name" },
        { header: "Cut Size", dataKey: "cut_size_name" },
        { header: "Base UOM", dataKey: "base_uom_name" },
      ];
      recipe.group_specific_meal_times.forEach(mt => {
        ingredientTableColumns.push({ header: `${mt} Qty`, dataKey: `qty_${mt}` });
      });

      const ingredientTableRows = recipe.ingredients.map(ing => {
        const row: any = {
          ingredient_name: ing.ingredient_name,
          preparation_type_name: ing.preparation_type_name || 'N/A',
          cut_size_name: ing.cut_size_name || 'N/A',
          base_uom_name: ing.base_uom_name,
        };
        recipe.group_specific_meal_times.forEach(mt => {
          row[`qty_${mt}`] = ing.quantities_by_meal_time[mt]?.toFixed(4) === '0.0000' ? '' : ing.quantities_by_meal_time[mt]?.toFixed(4) || '';
        });
        return row;
      });

      (doc as any).autoTable({
        columns: ingredientTableColumns,
        body: ingredientTableRows,
        startY: currentY,
        theme: 'striped',
        headStyles: { fillColor: [75, 85, 99] }, 
        styles: { fontSize: 7, cellPadding: 1 },
      });
      currentY = (doc as any).lastAutoTable.finalY + 3;
      
      const summaryTableBody: any[] = [];
      const uomTotals: Record<string, Record<string, number>> = {};
      recipe.group_specific_meal_times.forEach(mt => {
        uomTotals[mt] = {};
        recipe.ingredients.forEach(ing => {
          const qty = ing.quantities_by_meal_time[mt] || 0;
          uomTotals[mt][ing.base_uom_name] = (uomTotals[mt][ing.base_uom_name] || 0) + qty;
        });
      });
      
      const allUOMs = Array.from(new Set(recipe.ingredients.map(i => i.base_uom_name))).sort();
      allUOMs.forEach(uom => {
          const uomRow: any = { metric: `Total Qty Required (${uom}):` };
          recipe.group_specific_meal_times.forEach(mt => {
              uomRow[mt] = uomTotals[mt]?.[uom]?.toFixed(4) === '0.0000' ? '' : uomTotals[mt]?.[uom]?.toFixed(4) || '';
          });
          summaryTableBody.push(uomRow);
      });

      const animalRow: any = { metric: "# of Animals" };
      recipe.group_specific_meal_times.forEach(mt => {
        animalRow[mt] = (recipe.animals_per_meal_time[mt] || []).length.toString();
      });
      summaryTableBody.push(animalRow);

      const speciesRow: any = { metric: "# of Species" };
      recipe.group_specific_meal_times.forEach(mt => {
        speciesRow[mt] = (recipe.species_details_per_meal_time[mt] || []).length.toString();
      });
      summaryTableBody.push(speciesRow);

      const enclosureRow: any = { metric: "# of Enclosures" };
      recipe.group_specific_meal_times.forEach(mt => {
        enclosureRow[mt] = (recipe.enclosures_per_meal_time[mt] || []).length.toString();
      });
      summaryTableBody.push(enclosureRow);
      
      const summaryTableColumns = [{ header: "Time Slot", dataKey: "metric" }];
      recipe.group_specific_meal_times.forEach(mt => {
          summaryTableColumns.push({header: mt, dataKey: mt});
      });

      (doc as any).autoTable({
        columns: summaryTableColumns,
        body: summaryTableBody,
        startY: currentY,
        theme: 'grid',
        headStyles: { fillColor: [100, 116, 139], textColor: 255 }, 
        styles: { fontSize: 7, cellPadding: 1 },
        columnStyles: { metric: { fontStyle: 'bold'}},
      });
      currentY = (doc as any).lastAutoTable.finalY + 5;
    });

    doc.save('all_recipes_report.pdf');
  };

  const handleSingleRecipePdfDownload = (recipe: GroupedRecipe) => {
    if (!recipe || recipe.ingredients.length === 0) {
      alert("No ingredient data for this recipe to download.");
      return;
    }

    const doc = new jsPDF();
    let currentY = 15;

    doc.setFontSize(16);
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
    currentY += 4;

    const speciesText = `Consuming Species: ${recipe.overall_consuming_species_details.length} ${formatSpeciesDetails(recipe.overall_consuming_species_details)}`;
    const splitSpeciesText = doc.splitTextToSize(speciesText, doc.internal.pageSize.getWidth() - 28);
    doc.text(splitSpeciesText, 14, currentY);
    currentY += (splitSpeciesText.length * 3.5) + 2;

    doc.text(`Consuming Animals: ${recipe.overall_consuming_animals_count}`, 14, currentY); currentY += 4;
    doc.text(`Consuming Enclosures: ${recipe.overall_consuming_enclosures_count}`, 14, currentY); currentY += 4;

    const scheduledTimesString = recipe.scheduled_meal_times.length > 0 ? recipe.scheduled_meal_times.map(t => t.trim()).filter(Boolean).join(', ') : 'N/A';
    const mealTimesText = `Scheduled Meal Times: ${scheduledTimesString}`;
    const splitMealTimesText = doc.splitTextToSize(mealTimesText, doc.internal.pageSize.getWidth() - 28);
    doc.text(splitMealTimesText, 14, currentY);
    currentY += (splitMealTimesText.length * 3.5) + 2;

    const ingredientTableColumns = [
        { header: "Ingredient Name", dataKey: "ingredient_name" },
        { header: "Prep Type", dataKey: "preparation_type_name" },
        { header: "Cut Size", dataKey: "cut_size_name" },
        { header: "Base UOM", dataKey: "base_uom_name" },
    ];
    recipe.group_specific_meal_times.forEach(mt => {
        ingredientTableColumns.push({ header: `${mt} Qty`, dataKey: `qty_${mt}` });
    });

    const ingredientTableRows = recipe.ingredients.map(ing => {
        const row: any = {
            ingredient_name: ing.ingredient_name,
            preparation_type_name: ing.preparation_type_name || 'N/A',
            cut_size_name: ing.cut_size_name || 'N/A',
            base_uom_name: ing.base_uom_name,
        };
        recipe.group_specific_meal_times.forEach(mt => {
            row[`qty_${mt}`] = ing.quantities_by_meal_time[mt]?.toFixed(4) === '0.0000' ? '' : ing.quantities_by_meal_time[mt]?.toFixed(4) || '';
        });
        return row;
    });

    (doc as any).autoTable({
        columns: ingredientTableColumns,
        body: ingredientTableRows,
        startY: currentY,
        theme: 'striped',
        headStyles: { fillColor: [75, 85, 99] },
        styles: { fontSize: 7, cellPadding: 1 },
    });
    currentY = (doc as any).lastAutoTable.finalY + 3;

    const summaryTableBody: any[] = [];
    const uomTotals: Record<string, Record<string, number>> = {};
    recipe.group_specific_meal_times.forEach(mt => {
      uomTotals[mt] = {};
      recipe.ingredients.forEach(ing => {
        const qty = ing.quantities_by_meal_time[mt] || 0;
        uomTotals[mt][ing.base_uom_name] = (uomTotals[mt][ing.base_uom_name] || 0) + qty;
      });
    });
    
    const allUOMs = Array.from(new Set(recipe.ingredients.map(i => i.base_uom_name))).sort();
    allUOMs.forEach(uom => {
        const uomRow: any = { metric: `Total Qty Required (${uom}):` };
        recipe.group_specific_meal_times.forEach(mt => {
            uomRow[mt] = uomTotals[mt]?.[uom]?.toFixed(4) === '0.0000' ? '' : uomTotals[mt]?.[uom]?.toFixed(4) || '';
        });
        summaryTableBody.push(uomRow);
    });
    
    const animalRow: any = { metric: "# of Animals" };
    recipe.group_specific_meal_times.forEach(mt => { animalRow[mt] = (recipe.animals_per_meal_time[mt] || []).length.toString(); });
    summaryTableBody.push(animalRow);

    const speciesRow: any = { metric: "# of Species" };
    recipe.group_specific_meal_times.forEach(mt => { speciesRow[mt] = (recipe.species_details_per_meal_time[mt] || []).length.toString(); });
    summaryTableBody.push(speciesRow);

    const enclosureRow: any = { metric: "# of Enclosures" };
    recipe.group_specific_meal_times.forEach(mt => { enclosureRow[mt] = (recipe.enclosures_per_meal_time[mt] || []).length.toString(); });
    summaryTableBody.push(enclosureRow);

    const summaryTableColumns = [{ header: "Time Slot", dataKey: "metric" }];
    recipe.group_specific_meal_times.forEach(mt => {
        summaryTableColumns.push({header: mt, dataKey: mt});
    });

    (doc as any).autoTable({
        columns: summaryTableColumns,
        body: summaryTableBody,
        startY: currentY,
        theme: 'grid',
        headStyles: { fillColor: [100, 116, 139], textColor: 255 },
        styles: { fontSize: 7, cellPadding: 1 },
        columnStyles: { metric: { fontStyle: 'bold'}},
    });

    const fileName = `Recipe_${recipe.recipe_name.replace(/\s+/g, '_')}_${targetDisplayDuration}Days.pdf`;
    doc.save(fileName);
  };

  const handleAllCombosPdfDownload = () => {
    if (!displayableCombos || displayableCombos.length === 0) {
      alert("No combo ingredients with items to download based on current filters.");
      return;
    }
    const doc = new jsPDF();
    let currentY = 15;
    doc.setFontSize(16);
    doc.text(formattedComboTitle, 14, currentY);
    currentY += 8;

    displayableCombos.forEach((comboGroup, index) => {
      if (index > 0 && (currentY + 70 > doc.internal.pageSize.getHeight() -20)) { 
        doc.addPage();
        currentY = 15;
        doc.setFontSize(16);
        doc.text(formattedComboTitle + " (cont.)", 14, currentY);
        currentY += 8;
      } else if (index > 0) {
         currentY += 10;
      }

      doc.setFontSize(12);
      let groupTitle = comboGroup.combo_group_name;
      if (selectedMealTimes.length === 1) {
        groupTitle += ` - ${selectedMealTimes[0]}`;
      }
      doc.text(groupTitle, 14, currentY);
      currentY += 6;
      doc.setFontSize(8);

      const overallSpeciesText = `Consuming Species: ${comboGroup.overall_consuming_species_details.length} ${formatSpeciesDetails(comboGroup.overall_consuming_species_details)}`;
      const splitOverallSpeciesText = doc.splitTextToSize(overallSpeciesText, doc.internal.pageSize.getWidth() - 28);
      doc.text(splitOverallSpeciesText, 14, currentY);
      currentY += (splitOverallSpeciesText.length * 3.5) + 2;

      doc.text(`Consuming Animals: ${comboGroup.overall_consuming_animals_count}`, 14, currentY); currentY += 4;
      doc.text(`Consuming Enclosures: ${comboGroup.overall_consuming_enclosures_count}`, 14, currentY); currentY += 4;
      
      const scheduledTimesString = comboGroup.group_specific_meal_times.length > 0 ? comboGroup.group_specific_meal_times.join(', ') : 'N/A'; // Using group_specific_meal_times for scheduled
      const mealTimesText = `Scheduled Meal Times: ${scheduledTimesString}`;
      const splitMealTimesText = doc.splitTextToSize(mealTimesText, doc.internal.pageSize.getWidth() - 28);
      doc.text(splitMealTimesText, 14, currentY);
      currentY += (splitMealTimesText.length * 3.5) + 2;


      const ingredientTableColumns = [
        { header: "Ingredient Name", dataKey: "ingredient_name" },
        { header: "Prep Type", dataKey: "preparation_type_name" },
        { header: "Cut Size", dataKey: "cut_size_name" },
        { header: "Base UOM", dataKey: "base_uom_name" },
      ];
      comboGroup.group_specific_meal_times.forEach(mt => {
        ingredientTableColumns.push({ header: `${mt} Qty`, dataKey: `qty_${mt}` });
      });

      const ingredientTableRows = comboGroup.ingredients.map(ing => {
        const row: any = {
          ingredient_name: ing.ingredient_name,
          preparation_type_name: ing.preparation_type_name || 'N/A',
          cut_size_name: ing.cut_size_name || 'N/A',
          base_uom_name: ing.base_uom_name,
        };
        comboGroup.group_specific_meal_times.forEach(mt => {
          row[`qty_${mt}`] = ing.quantities_by_meal_time[mt]?.toFixed(4) === '0.0000' ? '' : ing.quantities_by_meal_time[mt]?.toFixed(4) || '';
        });
        return row;
      });

      (doc as any).autoTable({
        columns: ingredientTableColumns,
        body: ingredientTableRows,
        startY: currentY,
        theme: 'striped',
        headStyles: { fillColor: [75, 85, 99] },
        styles: { fontSize: 7, cellPadding: 1 },
      });
      currentY = (doc as any).lastAutoTable.finalY + 3;

      const summaryTableBody: any[] = [];
      const uomTotals: Record<string, Record<string, number>> = {};
      comboGroup.group_specific_meal_times.forEach(mt => {
        uomTotals[mt] = {};
        comboGroup.ingredients.forEach(ing => {
          const qty = ing.quantities_by_meal_time[mt] || 0;
          uomTotals[mt][ing.base_uom_name] = (uomTotals[mt][ing.base_uom_name] || 0) + qty;
        });
      });

      const allUOMs = Array.from(new Set(comboGroup.ingredients.map(i => i.base_uom_name))).sort();
      allUOMs.forEach(uom => {
          const uomRow: any = { metric: `Total Qty Required (${uom}):` };
          comboGroup.group_specific_meal_times.forEach(mt => {
              uomRow[mt] = uomTotals[mt]?.[uom]?.toFixed(4) === '0.0000' ? '' : uomTotals[mt]?.[uom]?.toFixed(4) || '';
          });
          summaryTableBody.push(uomRow);
      });

      const animalRow: any = { metric: "# of Animals" };
      comboGroup.group_specific_meal_times.forEach(mt => {
        animalRow[mt] = (comboGroup.animals_per_meal_time[mt] || []).length.toString();
      });
      summaryTableBody.push(animalRow);

      const speciesRow: any = { metric: "# of Species" };
      comboGroup.group_specific_meal_times.forEach(mt => {
        speciesRow[mt] = (comboGroup.species_details_per_meal_time[mt] || []).length.toString();
      });
      summaryTableBody.push(speciesRow);

      const enclosureRow: any = { metric: "# of Enclosures" };
      comboGroup.group_specific_meal_times.forEach(mt => {
        enclosureRow[mt] = (comboGroup.enclosures_per_meal_time[mt] || []).length.toString();
      });
      summaryTableBody.push(enclosureRow);

      const summaryTableColumns = [{ header: "Time Slot", dataKey: "metric" }];
      comboGroup.group_specific_meal_times.forEach(mt => {
          summaryTableColumns.push({header: mt, dataKey: mt});
      });

      (doc as any).autoTable({
        columns: summaryTableColumns,
        body: summaryTableBody,
        startY: currentY,
        theme: 'grid',
        headStyles: { fillColor: [100, 116, 139], textColor: 255 }, 
        styles: { fontSize: 7, cellPadding: 1 },
        columnStyles: { metric: { fontStyle: 'bold'}},
      });
      currentY = (doc as any).lastAutoTable.finalY + 5;
    });
    doc.save('all_combo_ingredients_report.pdf');
  };

  const handleSingleComboPdfDownload = (group: GroupedComboIngredient) => {
    if (!group || group.ingredients.length === 0) {
      alert("No ingredient data for this combo group to download.");
      return;
    }
    const doc = new jsPDF();
    let currentY = 15;

    doc.setFontSize(16);
    let groupTitle = group.combo_group_name;
    if (selectedMealTimes.length === 1) {
        groupTitle += ` - ${selectedMealTimes[0]}`;
    }
    doc.text(groupTitle, 14, currentY);
    currentY += 8;
    doc.setFontSize(8);

    const overallSpeciesText = `Consuming Species: ${group.overall_consuming_species_details.length} ${formatSpeciesDetails(group.overall_consuming_species_details)}`;
    const splitOverallSpeciesText = doc.splitTextToSize(overallSpeciesText, doc.internal.pageSize.getWidth() - 28);
    doc.text(splitOverallSpeciesText, 14, currentY);
    currentY += (splitOverallSpeciesText.length * 3.5) + 2;

    doc.text(`Consuming Animals: ${group.overall_consuming_animals_count}`, 14, currentY); currentY += 4;
    doc.text(`Consuming Enclosures: ${group.overall_consuming_enclosures_count}`, 14, currentY); currentY += 4;
    
    const scheduledTimesString = group.group_specific_meal_times.length > 0 ? group.group_specific_meal_times.join(', ') : 'N/A';
    const mealTimesText = `Scheduled Meal Times: ${scheduledTimesString}`;
    const splitMealTimesText = doc.splitTextToSize(mealTimesText, doc.internal.pageSize.getWidth() - 28);
    doc.text(splitMealTimesText, 14, currentY);
    currentY += (splitMealTimesText.length * 3.5) + 2;


    const ingredientTableColumns = [
        { header: "Ingredient Name", dataKey: "ingredient_name" },
        { header: "Prep Type", dataKey: "preparation_type_name" },
        { header: "Cut Size", dataKey: "cut_size_name" },
        { header: "Base UOM", dataKey: "base_uom_name" },
    ];
    group.group_specific_meal_times.forEach(mt => {
        ingredientTableColumns.push({ header: `${mt} Qty`, dataKey: `qty_${mt}` });
    });

    const ingredientTableRows = group.ingredients.map(ing => {
        const row: any = {
            ingredient_name: ing.ingredient_name,
            preparation_type_name: ing.preparation_type_name || 'N/A',
            cut_size_name: ing.cut_size_name || 'N/A',
            base_uom_name: ing.base_uom_name,
        };
        group.group_specific_meal_times.forEach(mt => {
            row[`qty_${mt}`] = ing.quantities_by_meal_time[mt]?.toFixed(4) === '0.0000' ? '' : ing.quantities_by_meal_time[mt]?.toFixed(4) || '';
        });
        return row;
    });

    (doc as any).autoTable({
        columns: ingredientTableColumns,
        body: ingredientTableRows,
        startY: currentY,
        theme: 'striped',
        headStyles: { fillColor: [75, 85, 99] },
        styles: { fontSize: 7, cellPadding: 1 },
    });
    currentY = (doc as any).lastAutoTable.finalY + 3;

    const summaryTableBody: any[] = [];
    const uomTotals: Record<string, Record<string, number>> = {};
    group.group_specific_meal_times.forEach(mt => {
      uomTotals[mt] = {};
      group.ingredients.forEach(ing => {
        const qty = ing.quantities_by_meal_time[mt] || 0;
        uomTotals[mt][ing.base_uom_name] = (uomTotals[mt][ing.base_uom_name] || 0) + qty;
      });
    });

    const allUOMs = Array.from(new Set(group.ingredients.map(i => i.base_uom_name))).sort();
    allUOMs.forEach(uom => {
        const uomRow: any = { metric: `Total Qty Required (${uom}):` };
        group.group_specific_meal_times.forEach(mt => {
            uomRow[mt] = uomTotals[mt]?.[uom]?.toFixed(4) === '0.0000' ? '' : uomTotals[mt]?.[uom]?.toFixed(4) || '';
        });
        summaryTableBody.push(uomRow);
    });

    const animalRow: any = { metric: "# of Animals" };
    group.group_specific_meal_times.forEach(mt => { animalRow[mt] = (group.animals_per_meal_time[mt] || []).length.toString(); });
    summaryTableBody.push(animalRow);

    const speciesRow: any = { metric: "# of Species" };
    group.group_specific_meal_times.forEach(mt => { speciesRow[mt] = (group.species_details_per_meal_time[mt] || []).length.toString(); });
    summaryTableBody.push(speciesRow);

    const enclosureRow: any = { metric: "# of Enclosures" };
    group.group_specific_meal_times.forEach(mt => { enclosureRow[mt] = (group.enclosures_per_meal_time[mt] || []).length.toString(); });
    summaryTableBody.push(enclosureRow);

    const summaryTableColumns = [{ header: "Time Slot", dataKey: "metric" }];
    group.group_specific_meal_times.forEach(mt => {
        summaryTableColumns.push({header: mt, dataKey: mt});
    });

    (doc as any).autoTable({
        columns: summaryTableColumns,
        body: summaryTableBody,
        startY: currentY,
        theme: 'grid',
        headStyles: { fillColor: [100, 116, 139], textColor: 255 },
        styles: { fontSize: 7, cellPadding: 1 },
        columnStyles: { metric: { fontStyle: 'bold'}},
    });

    doc.save(`ComboGroup_${group.combo_group_name.replace(/\s+/g, '_')}_${targetDisplayDuration}Days.pdf`);
  };

  const handleAllChoicesPdfDownload = () => {
     if (!displayableChoices || displayableChoices.length === 0) {
      alert("No choice ingredients with items to download based on current filters.");
      return;
    }

    const doc = new jsPDF();
    let currentY = 15;
    doc.setFontSize(16);
    doc.text(formattedChoiceTitle, 14, currentY);
    currentY += 8;

    displayableChoices.forEach((group, index) => {
      if (index > 0 && (currentY + 70 > doc.internal.pageSize.getHeight() - 20)) {
        doc.addPage(); currentY = 15; doc.setFontSize(16);
        doc.text(formattedChoiceTitle + " (cont.)", 14, currentY); currentY += 8;
      } else if (index > 0) {
        currentY +=10;
      }

      doc.setFontSize(12);
      let groupTitle = group.choice_group_name;
      if (selectedMealTimes.length === 1) {
        groupTitle += ` - ${selectedMealTimes[0]}`;
      }
      doc.text(groupTitle, 14, currentY);
      currentY += 6;
      doc.setFontSize(8);
      
      const overallSpeciesText = `Consuming Species: ${group.overall_consuming_species_details.length} ${formatSpeciesDetails(group.overall_consuming_species_details)}`;
      const splitOverallSpeciesText = doc.splitTextToSize(overallSpeciesText, doc.internal.pageSize.getWidth() - 28);
      doc.text(splitOverallSpeciesText, 14, currentY);
      currentY += (splitOverallSpeciesText.length * 3.5) + 2;

      doc.text(`Consuming Animals: ${group.overall_consuming_animals_count}`, 14, currentY); currentY += 4;
      doc.text(`Consuming Enclosures: ${group.overall_consuming_enclosures_count}`, 14, currentY); currentY += 4;
      
      const scheduledTimesString = group.group_specific_meal_times.length > 0 ? group.group_specific_meal_times.join(', ') : 'N/A';
      const mealTimesText = `Scheduled Meal Times: ${scheduledTimesString}`;
      const splitMealTimesText = doc.splitTextToSize(mealTimesText, doc.internal.pageSize.getWidth() - 28);
      doc.text(splitMealTimesText, 14, currentY);
      currentY += (splitMealTimesText.length * 3.5) + 2;


      const ingredientTableColumns = [
          { header: "Ingredient Name", dataKey: "ingredient_name" },
          { header: "Prep Type", dataKey: "preparation_type_name" },
          { header: "Cut Size", dataKey: "cut_size_name" },
          { header: "Base UOM", dataKey: "base_uom_name" },
      ];
      group.group_specific_meal_times.forEach(mt => {
          ingredientTableColumns.push({ header: `${mt} Qty`, dataKey: `qty_${mt}` });
      });

      const ingredientTableRows = group.ingredients.map(ing => {
          const row: any = {
              ingredient_name: ing.ingredient_name,
              preparation_type_name: ing.preparation_type_name || 'N/A',
              cut_size_name: ing.cut_size_name || 'N/A',
              base_uom_name: ing.base_uom_name,
          };
          group.group_specific_meal_times.forEach(mt => {
              row[`qty_${mt}`] = ing.quantities_by_meal_time[mt]?.toFixed(4) === '0.0000' ? '' : ing.quantities_by_meal_time[mt]?.toFixed(4) || '';
          });
          return row;
      });

      (doc as any).autoTable({
          columns: ingredientTableColumns,
          body: ingredientTableRows,
          startY: currentY,
          theme: 'striped',
          headStyles: { fillColor: [75, 85, 99] },
          styles: { fontSize: 7, cellPadding: 1 },
      });
      currentY = (doc as any).lastAutoTable.finalY + 3;

      const summaryTableBody: any[] = [];
      const uomTotals: Record<string, Record<string, number>> = {};
      group.group_specific_meal_times.forEach(mt => {
        uomTotals[mt] = {};
        group.ingredients.forEach(ing => {
          const qty = ing.quantities_by_meal_time[mt] || 0;
          uomTotals[mt][ing.base_uom_name] = (uomTotals[mt][ing.base_uom_name] || 0) + qty;
        });
      });

      const allUOMs = Array.from(new Set(group.ingredients.map(i => i.base_uom_name))).sort();
      allUOMs.forEach(uom => {
          const uomRow: any = { metric: `Total Qty Required (${uom}):` };
          group.group_specific_meal_times.forEach(mt => {
              uomRow[mt] = uomTotals[mt]?.[uom]?.toFixed(4) === '0.0000' ? '' : uomTotals[mt]?.[uom]?.toFixed(4) || '';
          });
          summaryTableBody.push(uomRow);
      });

      const animalRow: any = { metric: "# of Animals" };
      group.group_specific_meal_times.forEach(mt => { animalRow[mt] = (group.animals_per_meal_time[mt] || []).length.toString(); });
      summaryTableBody.push(animalRow);

      const speciesRow: any = { metric: "# of Species" };
      group.group_specific_meal_times.forEach(mt => { speciesRow[mt] = (group.species_details_per_meal_time[mt] || []).length.toString(); });
      summaryTableBody.push(speciesRow);

      const enclosureRow: any = { metric: "# of Enclosures" };
      group.group_specific_meal_times.forEach(mt => { enclosureRow[mt] = (group.enclosures_per_meal_time[mt] || []).length.toString(); });
      summaryTableBody.push(enclosureRow);

      const summaryTableColumns = [{ header: "Time Slot", dataKey: "metric" }];
      group.group_specific_meal_times.forEach(mt => {
          summaryTableColumns.push({header: mt, dataKey: mt});
      });

      (doc as any).autoTable({
          columns: summaryTableColumns,
          body: summaryTableBody,
          startY: currentY,
          theme: 'grid',
          headStyles: { fillColor: [100, 116, 139], textColor: 255 },
          styles: { fontSize: 7, cellPadding: 1 },
          columnStyles: { metric: { fontStyle: 'bold'}},
      });
      currentY = (doc as any).lastAutoTable.finalY + 5;
    });
    doc.save('all_choice_ingredients_report.pdf');
  };

  const handleSingleChoicePdfDownload = (group: GroupedChoiceIngredient) => {
    if (!group || group.ingredients.length === 0) return alert("No ingredient data for this choice group to download.");
    const doc = new jsPDF();
    let currentY = 15;
    doc.setFontSize(16);
    let groupTitle = group.choice_group_name;
    if (selectedMealTimes.length === 1) {
        groupTitle += ` - ${selectedMealTimes[0]}`;
    }
    doc.text(groupTitle, 14, currentY);
    currentY += 8;
    doc.setFontSize(8);
    
    const overallSpeciesText = `Consuming Species: ${group.overall_consuming_species_details.length} ${formatSpeciesDetails(group.overall_consuming_species_details)}`;
    const splitOverallSpeciesText = doc.splitTextToSize(overallSpeciesText, doc.internal.pageSize.getWidth() - 28);
    doc.text(splitOverallSpeciesText, 14, currentY);
    currentY += (splitOverallSpeciesText.length * 3.5) + 2;

    doc.text(`Consuming Animals: ${group.overall_consuming_animals_count}`, 14, currentY); currentY += 4;
    doc.text(`Consuming Enclosures: ${group.overall_consuming_enclosures_count}`, 14, currentY); currentY += 4;
    
    const scheduledTimesString = group.group_specific_meal_times.length > 0 ? group.group_specific_meal_times.join(', ') : 'N/A';
    const mealTimesText = `Scheduled Meal Times: ${scheduledTimesString}`;
    const splitMealTimesText = doc.splitTextToSize(mealTimesText, doc.internal.pageSize.getWidth() - 28);
    doc.text(splitMealTimesText, 14, currentY);
    currentY += (splitMealTimesText.length * 3.5) + 2;

    const ingredientTableColumns = [
        { header: "Ingredient Name", dataKey: "ingredient_name" },
        { header: "Prep Type", dataKey: "preparation_type_name" },
        { header: "Cut Size", dataKey: "cut_size_name" },
        { header: "Base UOM", dataKey: "base_uom_name" },
    ];
    group.group_specific_meal_times.forEach(mt => {
        ingredientTableColumns.push({ header: `${mt} Qty`, dataKey: `qty_${mt}` });
    });

    const ingredientTableRows = group.ingredients.map(ing => {
        const row: any = {
            ingredient_name: ing.ingredient_name,
            preparation_type_name: ing.preparation_type_name || 'N/A',
            cut_size_name: ing.cut_size_name || 'N/A',
            base_uom_name: ing.base_uom_name,
        };
        group.group_specific_meal_times.forEach(mt => {
            row[`qty_${mt}`] = ing.quantities_by_meal_time[mt]?.toFixed(4) === '0.0000' ? '' : ing.quantities_by_meal_time[mt]?.toFixed(4) || '';
        });
        return row;
    });

    (doc as any).autoTable({
        columns: ingredientTableColumns,
        body: ingredientTableRows,
        startY: currentY,
        theme: 'striped',
        headStyles: { fillColor: [75, 85, 99] },
        styles: { fontSize: 7, cellPadding: 1 },
    });
    currentY = (doc as any).lastAutoTable.finalY + 3;

    const summaryTableBody: any[] = [];
    const uomTotals: Record<string, Record<string, number>> = {};
    group.group_specific_meal_times.forEach(mt => {
      uomTotals[mt] = {};
      group.ingredients.forEach(ing => {
        const qty = ing.quantities_by_meal_time[mt] || 0;
        uomTotals[mt][ing.base_uom_name] = (uomTotals[mt][ing.base_uom_name] || 0) + qty;
      });
    });

    const allUOMs = Array.from(new Set(group.ingredients.map(i => i.base_uom_name))).sort();
    allUOMs.forEach(uom => {
        const uomRow: any = { metric: `Total Qty Required (${uom}):` };
        group.group_specific_meal_times.forEach(mt => {
            uomRow[mt] = uomTotals[mt]?.[uom]?.toFixed(4) === '0.0000' ? '' : uomTotals[mt]?.[uom]?.toFixed(4) || '';
        });
        summaryTableBody.push(uomRow);
    });

    const animalRow: any = { metric: "# of Animals" };
    group.group_specific_meal_times.forEach(mt => { animalRow[mt] = (group.animals_per_meal_time[mt] || []).length.toString(); });
    summaryTableBody.push(animalRow);

    const speciesRow: any = { metric: "# of Species" };
    group.group_specific_meal_times.forEach(mt => { speciesRow[mt] = (group.species_details_per_meal_time[mt] || []).length.toString(); });
    summaryTableBody.push(speciesRow);

    const enclosureRow: any = { metric: "# of Enclosures" };
    group.group_specific_meal_times.forEach(mt => { enclosureRow[mt] = (group.enclosures_per_meal_time[mt] || []).length.toString(); });
    summaryTableBody.push(enclosureRow);

    const summaryTableColumns = [{ header: "Time Slot", dataKey: "metric" }];
    group.group_specific_meal_times.forEach(mt => {
        summaryTableColumns.push({header: mt, dataKey: mt});
    });

    (doc as any).autoTable({
        columns: summaryTableColumns,
        body: summaryTableBody,
        startY: currentY,
        theme: 'grid',
        headStyles: { fillColor: [100, 116, 139], textColor: 255 },
        styles: { fontSize: 7, cellPadding: 1 },
        columnStyles: { metric: { fontStyle: 'bold'}},
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
              title={formattedIngredientTotalsTitle}
              viewId="ingredient_totals_report"
              isLoading={isProcessingOverall || isLoading}
              onPdfDownload={handleAllTypeIngredientsPdfDownload}
            >
              {(isProcessingOverall || isLoading) ? (
                <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                  <p>Loading ingredient totals...</p>
                </div>
              ) : !displayableIngredientTotals || displayableIngredientTotals.length === 0 ? (
                <p className="text-muted-foreground p-4 text-center">No ingredient data available based on current filters.</p>
              ) : (
                <div className="space-y-6">
                  {displayableIngredientTotals.map((typeGroup) => {
                    const itemKey = `type-${typeGroup.ingredient_type_name.replace(/\s+/g, '-')}`;
                    const totalsByMealTimeAndUOM: Record<string, Record<string, number>> = {};
                     typeGroup.group_specific_meal_times.forEach(mealTime => {
                        totalsByMealTimeAndUOM[mealTime] = {};
                        typeGroup.ingredients.forEach(ingredient => {
                            const qty = ingredient.quantities_by_meal_time[mealTime] || 0;
                            totalsByMealTimeAndUOM[mealTime][ingredient.base_uom_name] = 
                                (totalsByMealTimeAndUOM[mealTime][ingredient.base_uom_name] || 0) + qty;
                        });
                    });
                    const allUOMsInGroup = Array.from(new Set(typeGroup.ingredients.map(i => i.base_uom_name))).sort();
                    
                    return (
                    <Card key={itemKey} className="overflow-hidden shadow-md rounded-lg">
                      <CardHeader className="bg-muted/50 flex flex-row items-center justify-between p-4">
                        <div>
                          <CardTitle className="text-lg font-semibold text-accent">
                            {typeGroup.ingredient_type_name}{selectedMealTimes.length === 1 ? ` - ${selectedMealTimes[0]}` : ''}
                          </CardTitle>
                           <CardDescription className="text-sm text-foreground space-y-1 mt-1">
                                <div>
                                  Total for {targetDisplayDuration} Day{targetDisplayDuration > 1 ? 's' : ''}: {Object.entries(typeGroup.total_quantities_for_target_duration).map(([uom, qty]) => `${qty.toFixed(2)} ${uom}`).join(', ') || 'N/A'}
                                </div>
                                <div className="flex flex-row flex-wrap items-baseline">
                                  <span className="font-semibold whitespace-nowrap mr-1">Consuming Species:</span>
                                  <Button
                                      variant="link"
                                      className="p-0 h-auto text-sm text-primary font-bold"
                                      onClick={() => openSpeciesListModal(`Species consuming ${typeGroup.ingredient_type_name}`, typeGroup.overall_consuming_species_details)}
                                      disabled={typeGroup.overall_consuming_species_details.length === 0}
                                  >
                                      {typeGroup.overall_consuming_species_details.length}
                                  </Button>
                                  {typeGroup.overall_consuming_species_details.length > 0 && (
                                      <span className={`ml-1 ${!expandedSpeciesText[itemKey] ? "line-clamp-2" : ""}`}>
                                        {formatSpeciesDetails(typeGroup.overall_consuming_species_details, !expandedSpeciesText[itemKey] ? 10 : undefined)}
                                      </span>
                                  )}
                                  {typeGroup.overall_consuming_species_details.length > 10 && (
                                      <Button variant="link" className="p-0 h-auto text-xs ml-1 whitespace-nowrap" onClick={() => toggleSpeciesTextExpansion(itemKey)}>
                                          {expandedSpeciesText[itemKey] ? "(view less)" : "(view more)"}
                                      </Button>
                                  )}
                                </div>
                                <div>
                                  <span className="font-semibold">Consuming Animals: </span>
                                  <Button variant="link" className="p-0 h-auto text-sm text-primary font-bold" onClick={() => openAnimalListModal(`Animals consuming ${typeGroup.ingredient_type_name}`, typeGroup.overall_consuming_animal_ids)} disabled={typeGroup.overall_consuming_animals_count === 0}>
                                      {typeGroup.overall_consuming_animals_count}
                                  </Button>
                                </div>
                                <div>
                                  <span className="font-semibold">Consuming Enclosures: </span>
                                  <Button variant="link" className="p-0 h-auto text-sm text-primary font-bold" onClick={() => openEnclosureListModal(`Enclosures for ${typeGroup.ingredient_type_name}`, typeGroup.overall_consuming_enclosures)} disabled={typeGroup.overall_consuming_enclosures_count === 0}>
                                      {typeGroup.overall_consuming_enclosures_count}
                                  </Button>
                                </div>
                                <div>
                                  <span className="font-semibold">Scheduled Meal Times: </span>
                                  <div className="inline-flex flex-wrap gap-1 items-center">
                                    {typeGroup.scheduled_meal_times && typeGroup.scheduled_meal_times.length > 0
                                      ? typeGroup.scheduled_meal_times.map(time => <Badge key={time} variant="secondary" className="mr-1 mb-1">{time}</Badge>)
                                      : <Badge variant="outline">N/A</Badge>}
                                  </div>
                                </div>
                            </CardDescription>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSingleTypeIngredientPdfDownload(typeGroup)}
                          aria-label={`Download PDF for ${typeGroup.ingredient_type_name}`}
                          disabled={isProcessingOverall || isLoading || typeGroup.ingredients.length === 0}
                        >
                          <Download className="mr-2 h-4 w-4" /> PDF
                        </Button>
                      </CardHeader>
                      <CardContent className="p-0">
                         <div className="overflow-x-auto rounded-md border">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50">
                                    <tr>
                                        <th className="p-2 text-left font-semibold text-muted-foreground whitespace-nowrap">Ingredients Name</th>
                                        <th className="p-2 text-left font-semibold text-muted-foreground whitespace-nowrap">Preparation Types</th>
                                        <th className="p-2 text-left font-semibold text-muted-foreground whitespace-nowrap">Cut Sizes</th>
                                        <th className="p-2 text-left font-semibold text-muted-foreground whitespace-nowrap">Base UOM</th>
                                        {typeGroup.group_specific_meal_times.map(mealTime => (
                                            <th key={mealTime} className="p-2 text-left font-semibold text-muted-foreground whitespace-nowrap">{mealTime}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {typeGroup.ingredients.map((ingredient, ingIndex) => (
                                        <tr key={ingIndex} className="border-b last:border-b-0 hover:bg-muted/20">
                                            <td className="p-2 align-top whitespace-nowrap">{ingredient.ingredient_name}</td>
                                            <td className="p-2 align-top whitespace-nowrap">{ingredient.preparation_type_name || 'N/A'}</td>
                                            <td className="p-2 align-top whitespace-nowrap">{ingredient.cut_size_name || 'N/A'}</td>
                                            <td className="p-2 align-top whitespace-nowrap">{ingredient.base_uom_name}</td>
                                            {typeGroup.group_specific_meal_times.map(mealTime => (
                                                <td key={`${mealTime}-${ingIndex}`} className="p-2 align-top whitespace-nowrap">
                                                    {ingredient.quantities_by_meal_time[mealTime]?.toFixed(2) === '0.00' ? '' : ingredient.quantities_by_meal_time[mealTime]?.toFixed(2) || ''}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                                 <tfoot className="bg-muted/50 font-semibold">
                                    {allUOMsInGroup.map(uom => (
                                        <tr key={`total-uom-${itemKey}-${uom}`}>
                                            <td className="p-2 text-right font-medium text-muted-foreground whitespace-nowrap" colSpan={4}>Total Qty Required ({uom}):</td>
                                            {typeGroup.group_specific_meal_times.map(mealTime => (
                                                <td key={`total-${mealTime}-${uom}`} className="p-2 text-left whitespace-nowrap">
                                                    {totalsByMealTimeAndUOM[mealTime]?.[uom]?.toFixed(2) === '0.00' ? '' : totalsByMealTimeAndUOM[mealTime]?.[uom]?.toFixed(2) || ''}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                    <tr>
                                        <td className="p-2 font-medium text-muted-foreground whitespace-nowrap" colSpan={4}># of Animals</td>
                                        {typeGroup.group_specific_meal_times.map(mealTime => (
                                            <td key={`animals-${mealTime}`} className="p-2 text-left whitespace-nowrap">
                                                <Button variant="link" className="p-0 h-auto text-sm text-primary font-bold" onClick={() => openAnimalListModal(`Animals for ${typeGroup.ingredient_type_name} at ${mealTime}`, typeGroup.animals_per_meal_time[mealTime] || [])} disabled={(typeGroup.animals_per_meal_time[mealTime] || []).length === 0}>
                                                    {(typeGroup.animals_per_meal_time[mealTime] || []).length}
                                                </Button>
                                            </td>
                                        ))}
                                    </tr>
                                    <tr>
                                        <td className="p-2 font-medium text-muted-foreground whitespace-nowrap" colSpan={4}># of Species</td>
                                        {typeGroup.group_specific_meal_times.map(mealTime => (
                                            <td key={`species-${mealTime}`} className="p-2 text-left whitespace-nowrap">
                                                <Button variant="link" className="p-0 h-auto text-sm text-primary font-bold" onClick={() => openSpeciesListModal(`Species for ${typeGroup.ingredient_type_name} at ${mealTime}`, typeGroup.species_details_per_meal_time[mealTime] || [])} disabled={(typeGroup.species_details_per_meal_time[mealTime] || []).length === 0}>
                                                    {(typeGroup.species_details_per_meal_time[mealTime] || []).length}
                                                </Button>
                                            </td>
                                        ))}
                                    </tr>
                                    <tr>
                                        <td className="p-2 font-medium text-muted-foreground whitespace-nowrap" colSpan={4}># of Enclosures</td>
                                        {typeGroup.group_specific_meal_times.map(mealTime => (
                                            <td key={`enclosures-${mealTime}`} className="p-2 text-left whitespace-nowrap">
                                                <Button variant="link" className="p-0 h-auto text-sm text-primary font-bold" onClick={() => openEnclosureListModal(`Enclosures for ${typeGroup.ingredient_type_name} at ${mealTime}`, typeGroup.enclosures_per_meal_time[mealTime] || [])} disabled={(typeGroup.enclosures_per_meal_time[mealTime] || []).length === 0}>
                                                    {(typeGroup.enclosures_per_meal_time[mealTime] || []).length}
                                                </Button>
                                            </td>
                                        ))}
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                         {typeGroup.ingredients.length === 0 && <p className="text-muted-foreground p-4 text-center">No ingredients for this type.</p>}
                      </CardContent>
                    </Card>
                  )})}
                </div>
              )}
            </SectionCard>
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
                  {displayableRecipes.map((recipe) => {
                    const itemKey = `recipe-${recipe.recipe_name.replace(/\s+/g, '-')}`;
                    const totalsByMealTimeAndUOM: Record<string, Record<string, number>> = {};
                     recipe.group_specific_meal_times.forEach(mealTime => {
                        totalsByMealTimeAndUOM[mealTime] = {};
                        recipe.ingredients.forEach(ingredient => {
                            const qty = ingredient.quantities_by_meal_time[mealTime] || 0;
                            totalsByMealTimeAndUOM[mealTime][ingredient.base_uom_name] = 
                                (totalsByMealTimeAndUOM[mealTime][ingredient.base_uom_name] || 0) + qty;
                        });
                    });
                    const allUOMsInGroup = Array.from(new Set(recipe.ingredients.map(i => i.base_uom_name))).sort();
                    
                    return (
                    <Card key={itemKey} className="overflow-hidden shadow-md rounded-lg">
                      <CardHeader className="bg-muted/50 flex flex-row items-center justify-between p-4">
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
                                    onClick={() => openSpeciesListModal(`Species consuming ${recipe.recipe_name}`, recipe.overall_consuming_species_details)}
                                    disabled={recipe.overall_consuming_species_details.length === 0}
                                >
                                    {recipe.overall_consuming_species_details.length}
                                </Button>
                                {recipe.overall_consuming_species_details.length > 0 && (
                                     <span className={`ml-1 ${!expandedSpeciesText[itemKey] ? "line-clamp-2" : ""}`}>
                                     {formatSpeciesDetails(recipe.overall_consuming_species_details, !expandedSpeciesText[itemKey] ? 10 : undefined)}
                                   </span>
                                )}
                                {recipe.overall_consuming_species_details.length > 10 && (
                                    <Button variant="link" className="p-0 h-auto text-xs ml-1 whitespace-nowrap" onClick={() => toggleSpeciesTextExpansion(itemKey)}>
                                        {expandedSpeciesText[itemKey] ? "(view less)" : "(view more)"}
                                    </Button>
                                )}
                            </div>
                            <div>
                              <span className="font-semibold">Consuming Animals: </span>
                               <Button
                                  variant="link"
                                  className="p-0 h-auto text-sm text-primary font-bold"
                                  onClick={() => openAnimalListModal(`Animals consuming ${recipe.recipe_name}`, recipe.overall_consuming_animal_ids)}
                                  disabled={recipe.overall_consuming_animals_count === 0}
                                >
                                  {recipe.overall_consuming_animals_count}
                                </Button>
                            </div>
                             <div>
                              <span className="font-semibold">Consuming Enclosures: </span>
                                <Button
                                  variant="link"
                                  className="p-0 h-auto text-sm text-primary font-bold"
                                  onClick={() => openEnclosureListModal(`Enclosures for ${recipe.recipe_name}`, recipe.overall_consuming_enclosures)}
                                  disabled={recipe.overall_consuming_enclosures_count === 0}
                                >
                                  {recipe.overall_consuming_enclosures_count}
                                </Button>
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
                         <div className="overflow-x-auto rounded-md border">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50">
                                    <tr>
                                        <th className="p-2 text-left font-semibold text-muted-foreground whitespace-nowrap">Ingredients Name</th>
                                        <th className="p-2 text-left font-semibold text-muted-foreground whitespace-nowrap">Preparation Types</th>
                                        <th className="p-2 text-left font-semibold text-muted-foreground whitespace-nowrap">Cut Sizes</th>
                                        <th className="p-2 text-left font-semibold text-muted-foreground whitespace-nowrap">Base UOM</th>
                                        {recipe.group_specific_meal_times.map(mealTime => (
                                            <th key={mealTime} className="p-2 text-left font-semibold text-muted-foreground whitespace-nowrap">{mealTime}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {recipe.ingredients.map((ingredient, ingIndex) => (
                                        <tr key={ingIndex} className="border-b last:border-b-0 hover:bg-muted/20">
                                            <td className="p-2 align-top whitespace-nowrap">{ingredient.ingredient_name}</td>
                                            <td className="p-2 align-top whitespace-nowrap">{ingredient.preparation_type_name || 'N/A'}</td>
                                            <td className="p-2 align-top whitespace-nowrap">{ingredient.cut_size_name || 'N/A'}</td>
                                            <td className="p-2 align-top whitespace-nowrap">{ingredient.base_uom_name}</td>
                                            {recipe.group_specific_meal_times.map(mealTime => (
                                                <td key={`${mealTime}-${ingIndex}`} className="p-2 align-top whitespace-nowrap">
                                                    {ingredient.quantities_by_meal_time[mealTime]?.toFixed(4) === '0.0000' ? '' : ingredient.quantities_by_meal_time[mealTime]?.toFixed(4) || ''}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                                 <tfoot className="bg-muted/50 font-semibold">
                                    {allUOMsInGroup.map(uom => (
                                        <tr key={`total-uom-${itemKey}-${uom}`}>
                                            <td className="p-2 text-right font-medium text-muted-foreground whitespace-nowrap" colSpan={4}>Total Qty Required ({uom}):</td>
                                            {recipe.group_specific_meal_times.map(mealTime => (
                                                <td key={`total-${mealTime}-${uom}`} className="p-2 text-left whitespace-nowrap">
                                                    {totalsByMealTimeAndUOM[mealTime]?.[uom]?.toFixed(4) === '0.0000' ? '' : totalsByMealTimeAndUOM[mealTime]?.[uom]?.toFixed(4) || ''}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                    <tr>
                                        <td className="p-2 font-medium text-muted-foreground whitespace-nowrap" colSpan={4}># of Animals</td>
                                        {recipe.group_specific_meal_times.map(mealTime => (
                                            <td key={`animals-${mealTime}`} className="p-2 text-left whitespace-nowrap">
                                                <Button variant="link" className="p-0 h-auto text-sm text-primary font-bold" onClick={() => openAnimalListModal(`Animals for ${recipe.recipe_name} at ${mealTime}`, recipe.animals_per_meal_time[mealTime] || [])} disabled={(recipe.animals_per_meal_time[mealTime] || []).length === 0}>
                                                    {(recipe.animals_per_meal_time[mealTime] || []).length}
                                                </Button>
                                            </td>
                                        ))}
                                    </tr>
                                    <tr>
                                        <td className="p-2 font-medium text-muted-foreground whitespace-nowrap" colSpan={4}># of Species</td>
                                        {recipe.group_specific_meal_times.map(mealTime => (
                                            <td key={`species-${mealTime}`} className="p-2 text-left whitespace-nowrap">
                                                <Button variant="link" className="p-0 h-auto text-sm text-primary font-bold" onClick={() => openSpeciesListModal(`Species for ${recipe.recipe_name} at ${mealTime}`, recipe.species_details_per_meal_time[mealTime] || [])} disabled={(recipe.species_details_per_meal_time[mealTime] || []).length === 0}>
                                                    {(recipe.species_details_per_meal_time[mealTime] || []).length}
                                                </Button>
                                            </td>
                                        ))}
                                    </tr>
                                    <tr>
                                        <td className="p-2 font-medium text-muted-foreground whitespace-nowrap" colSpan={4}># of Enclosures</td>
                                        {recipe.group_specific_meal_times.map(mealTime => (
                                            <td key={`enclosures-${mealTime}`} className="p-2 text-left whitespace-nowrap">
                                                <Button variant="link" className="p-0 h-auto text-sm text-primary font-bold" onClick={() => openEnclosureListModal(`Enclosures for ${recipe.recipe_name} at ${mealTime}`, recipe.enclosures_per_meal_time[mealTime] || [])} disabled={(recipe.enclosures_per_meal_time[mealTime] || []).length === 0}>
                                                    {(recipe.enclosures_per_meal_time[mealTime] || []).length}
                                                </Button>
                                            </td>
                                        ))}
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
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
                  {displayableCombos.map((comboGroup) => {
                    const itemKey = `combo-${comboGroup.combo_group_name.replace(/\s+/g, '-')}`;
                    const totalsByMealTimeAndUOM: Record<string, Record<string, number>> = {};
                    comboGroup.group_specific_meal_times.forEach(mealTime => {
                        totalsByMealTimeAndUOM[mealTime] = {};
                        comboGroup.ingredients.forEach(ingredient => {
                            const qty = ingredient.quantities_by_meal_time[mealTime] || 0;
                            totalsByMealTimeAndUOM[mealTime][ingredient.base_uom_name] = 
                                (totalsByMealTimeAndUOM[mealTime][ingredient.base_uom_name] || 0) + qty;
                        });
                    });
                    const allUOMsInGroup = Array.from(new Set(comboGroup.ingredients.map(i => i.base_uom_name))).sort();

                    return (
                    <Card key={itemKey} className="overflow-hidden shadow-md rounded-lg">
                      <CardHeader className="bg-muted/50 flex flex-row items-center justify-between p-4">
                        <div>
                          <CardTitle className="text-lg font-semibold text-accent">
                            {comboGroup.combo_group_name}{selectedMealTimes.length === 1 ? ` - ${selectedMealTimes[0]}` : ''}
                          </CardTitle>
                           <CardDescription className="text-sm text-foreground space-y-1 mt-1">
                              <div className="flex flex-row flex-wrap items-baseline">
                                <span className="font-semibold whitespace-nowrap mr-1">Consuming Species:</span>
                                  <Button
                                      variant="link"
                                      className="p-0 h-auto text-sm text-primary font-bold"
                                      onClick={() => openSpeciesListModal(`Species consuming ${comboGroup.combo_group_name}`, comboGroup.overall_consuming_species_details)}
                                      disabled={comboGroup.overall_consuming_species_details.length === 0}
                                  >
                                      {comboGroup.overall_consuming_species_details.length}
                                  </Button>
                                  {comboGroup.overall_consuming_species_details.length > 0 && (
                                      <span className={`ml-1 ${!expandedSpeciesText[itemKey] ? "line-clamp-2" : ""}`}>
                                      {formatSpeciesDetails(comboGroup.overall_consuming_species_details, !expandedSpeciesText[itemKey] ? 10 : undefined)}
                                    </span>
                                  )}
                                  {comboGroup.overall_consuming_species_details.length > 10 && (
                                      <Button variant="link" className="p-0 h-auto text-xs ml-1 whitespace-nowrap" onClick={() => toggleSpeciesTextExpansion(itemKey)}>
                                          {expandedSpeciesText[itemKey] ? "(view less)" : "(view more)"}
                                      </Button>
                                  )}
                              </div>
                              <div>
                                <span className="font-semibold">Consuming Animals: </span>
                                <Button
                                    variant="link"
                                    className="p-0 h-auto text-sm text-primary font-bold"
                                    onClick={() => openAnimalListModal(`Animals consuming ${comboGroup.combo_group_name}`, comboGroup.overall_consuming_animal_ids)}
                                    disabled={comboGroup.overall_consuming_animals_count === 0}
                                  >
                                    {comboGroup.overall_consuming_animals_count}
                                  </Button>
                              </div>
                              <div>
                                <span className="font-semibold">Consuming Enclosures: </span>
                                  <Button
                                    variant="link"
                                    className="p-0 h-auto text-sm text-primary font-bold"
                                    onClick={() => openEnclosureListModal(`Enclosures for ${comboGroup.combo_group_name}`, comboGroup.overall_consuming_enclosures)}
                                    disabled={comboGroup.overall_consuming_enclosures_count === 0}
                                  >
                                    {comboGroup.overall_consuming_enclosures_count}
                                  </Button>
                              </div>
                              <div>
                                  <span className="font-semibold">Scheduled Meal Times: </span>
                                  <div className="inline-flex flex-wrap gap-1 items-center">
                                    {comboGroup.group_specific_meal_times && comboGroup.group_specific_meal_times.length > 0
                                      ? comboGroup.group_specific_meal_times.map(time => <Badge key={time} variant="secondary" className="mr-1 mb-1">{time}</Badge>)
                                      : <Badge variant="outline">N/A</Badge>}
                                  </div>
                                </div>
                            </CardDescription>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSingleComboPdfDownload(comboGroup)}
                          aria-label={`Download PDF for ${comboGroup.combo_group_name}`}
                          disabled={isProcessingCombo || isLoading || comboGroup.ingredients.length === 0}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          PDF
                        </Button>
                      </CardHeader>
                      <CardContent className="p-0">
                         <div className="overflow-x-auto rounded-md border">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50">
                                    <tr>
                                        <th className="p-2 text-left font-semibold text-muted-foreground whitespace-nowrap">Ingredients Name</th>
                                        <th className="p-2 text-left font-semibold text-muted-foreground whitespace-nowrap">Preparation Types</th>
                                        <th className="p-2 text-left font-semibold text-muted-foreground whitespace-nowrap">Cut Sizes</th>
                                        <th className="p-2 text-left font-semibold text-muted-foreground whitespace-nowrap">Base UOM</th>
                                        {comboGroup.group_specific_meal_times.map(mealTime => (
                                            <th key={mealTime} className="p-2 text-left font-semibold text-muted-foreground whitespace-nowrap">{mealTime}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {comboGroup.ingredients.map((ingredient, ingIndex) => (
                                        <tr key={ingIndex} className="border-b last:border-b-0 hover:bg-muted/20">
                                            <td className="p-2 align-top whitespace-nowrap">{ingredient.ingredient_name}</td>
                                            <td className="p-2 align-top whitespace-nowrap">{ingredient.preparation_type_name || 'N/A'}</td>
                                            <td className="p-2 align-top whitespace-nowrap">{ingredient.cut_size_name || 'N/A'}</td>
                                            <td className="p-2 align-top whitespace-nowrap">{ingredient.base_uom_name}</td>
                                            {comboGroup.group_specific_meal_times.map(mealTime => (
                                                <td key={`${mealTime}-${ingIndex}`} className="p-2 align-top whitespace-nowrap">
                                                    {ingredient.quantities_by_meal_time[mealTime]?.toFixed(4) === '0.0000' ? '' : ingredient.quantities_by_meal_time[mealTime]?.toFixed(4) || ''}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-muted/50 font-semibold">
                                    {allUOMsInGroup.map(uom => (
                                        <tr key={`total-uom-${itemKey}-${uom}`}>
                                            <td className="p-2 text-right font-medium text-muted-foreground whitespace-nowrap" colSpan={4}>Total Qty Required ({uom}):</td>
                                            {comboGroup.group_specific_meal_times.map(mealTime => (
                                                <td key={`total-${mealTime}-${uom}`} className="p-2 text-left whitespace-nowrap">
                                                    {totalsByMealTimeAndUOM[mealTime]?.[uom]?.toFixed(4) === '0.0000' ? '' : totalsByMealTimeAndUOM[mealTime]?.[uom]?.toFixed(4) || ''}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                     <tr>
                                        <td className="p-2 font-medium text-muted-foreground whitespace-nowrap" colSpan={4}># of Animals</td>
                                        {comboGroup.group_specific_meal_times.map(mealTime => (
                                            <td key={`animals-${mealTime}`} className="p-2 text-left whitespace-nowrap">
                                                <Button
                                                    variant="link"
                                                    className="p-0 h-auto text-sm text-primary font-bold"
                                                    onClick={() => openAnimalListModal(
                                                        `Animals for ${comboGroup.combo_group_name} at ${mealTime}`,
                                                        comboGroup.animals_per_meal_time[mealTime] || []
                                                    )}
                                                    disabled={(comboGroup.animals_per_meal_time[mealTime] || []).length === 0}
                                                >
                                                    {(comboGroup.animals_per_meal_time[mealTime] || []).length}
                                                </Button>
                                            </td>
                                        ))}
                                    </tr>
                                    <tr>
                                        <td className="p-2 font-medium text-muted-foreground whitespace-nowrap" colSpan={4}># of Species</td>
                                         {comboGroup.group_specific_meal_times.map(mealTime => (
                                            <td key={`species-${mealTime}`} className="p-2 text-left whitespace-nowrap">
                                                <Button
                                                    variant="link"
                                                    className="p-0 h-auto text-sm text-primary font-bold"
                                                    onClick={() => openSpeciesListModal(
                                                        `Species for ${comboGroup.combo_group_name} at ${mealTime}`,
                                                        comboGroup.species_details_per_meal_time[mealTime] || []
                                                    )}
                                                    disabled={(comboGroup.species_details_per_meal_time[mealTime] || []).length === 0}
                                                >
                                                    {(comboGroup.species_details_per_meal_time[mealTime] || []).length}
                                                </Button>
                                            </td>
                                        ))}
                                    </tr>
                                    <tr>
                                        <td className="p-2 font-medium text-muted-foreground whitespace-nowrap" colSpan={4}># of Enclosures</td>
                                        {comboGroup.group_specific_meal_times.map(mealTime => (
                                            <td key={`enclosures-${mealTime}`} className="p-2 text-left whitespace-nowrap">
                                                 <Button
                                                    variant="link"
                                                    className="p-0 h-auto text-sm text-primary font-bold"
                                                    onClick={() => openEnclosureListModal(
                                                        `Enclosures for ${comboGroup.combo_group_name} at ${mealTime}`,
                                                        comboGroup.enclosures_per_meal_time[mealTime] || []
                                                    )}
                                                    disabled={(comboGroup.enclosures_per_meal_time[mealTime] || []).length === 0}
                                                >
                                                    {(comboGroup.enclosures_per_meal_time[mealTime] || []).length}
                                                 </Button>
                                            </td>
                                        ))}
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                         {comboGroup.ingredients.length === 0 && <p className="text-muted-foreground p-4 text-center">No ingredients for this combo.</p>}
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
                  {displayableChoices.map((group) => {
                    const itemKey = `choice-${group.choice_group_name.replace(/\s+/g, '-')}`;
                    const totalsByMealTimeAndUOM: Record<string, Record<string, number>> = {};
                    group.group_specific_meal_times.forEach(mealTime => {
                        totalsByMealTimeAndUOM[mealTime] = {};
                        group.ingredients.forEach(ingredient => {
                            const qty = ingredient.quantities_by_meal_time[mealTime] || 0;
                            totalsByMealTimeAndUOM[mealTime][ingredient.base_uom_name] = 
                                (totalsByMealTimeAndUOM[mealTime][ingredient.base_uom_name] || 0) + qty;
                        });
                    });
                    const allUOMsInGroup = Array.from(new Set(group.ingredients.map(i => i.base_uom_name))).sort();

                    return (
                    <Card key={itemKey} className="overflow-hidden shadow-md rounded-lg">
                      <CardHeader className="bg-muted/50 flex flex-row items-center justify-between p-4">
                        <div>
                          <CardTitle className="text-lg font-semibold text-accent">
                            {group.choice_group_name}{selectedMealTimes.length === 1 ? ` - ${selectedMealTimes[0]}` : ''}
                          </CardTitle>
                          <CardDescription className="text-sm text-foreground space-y-1 mt-1">
                            <div className="flex flex-row flex-wrap items-baseline">
                              <span className="font-semibold whitespace-nowrap mr-1">Consuming Species:</span>
                                <Button
                                    variant="link"
                                    className="p-0 h-auto text-sm text-primary font-bold"
                                    onClick={() => openSpeciesListModal(`Species consuming ${group.choice_group_name}`, group.overall_consuming_species_details)}
                                    disabled={group.overall_consuming_species_details.length === 0}
                                >
                                    {group.overall_consuming_species_details.length}
                                </Button>
                                {group.overall_consuming_species_details.length > 0 && (
                                    <span className={`ml-1 ${!expandedSpeciesText[itemKey] ? "line-clamp-2" : ""}`}>
                                      {formatSpeciesDetails(group.overall_consuming_species_details, !expandedSpeciesText[itemKey] ? 10 : undefined)}
                                    </span>
                                )}
                                {group.overall_consuming_species_details.length > 10 && (
                                    <Button variant="link" className="p-0 h-auto text-xs ml-1 whitespace-nowrap" onClick={() => toggleSpeciesTextExpansion(itemKey)}>
                                        {expandedSpeciesText[itemKey] ? "(view less)" : "(view more)"}
                                    </Button>
                                )}
                              </div>
                            <div>
                              <span className="font-semibold">Consuming Animals: </span>
                               <Button
                                  variant="link"
                                  className="p-0 h-auto text-sm text-primary font-bold"
                                  onClick={() => openAnimalListModal(`Animals consuming ${group.choice_group_name}`, group.overall_consuming_animal_ids)}
                                  disabled={group.overall_consuming_animals_count === 0}
                                >
                                  {group.overall_consuming_animals_count}
                                </Button>
                            </div>
                            <div>
                              <span className="font-semibold">Consuming Enclosures: </span>
                                <Button
                                  variant="link"
                                  className="p-0 h-auto text-sm text-primary font-bold"
                                  onClick={() => openEnclosureListModal(`Enclosures for ${group.choice_group_name}`, group.overall_consuming_enclosures)}
                                  disabled={group.overall_consuming_enclosures_count === 0}
                                >
                                  {group.overall_consuming_enclosures_count}
                                </Button>
                            </div>
                             <div>
                                <span className="font-semibold">Scheduled Meal Times: </span>
                                <div className="inline-flex flex-wrap gap-1 items-center">
                                {group.group_specific_meal_times && group.group_specific_meal_times.length > 0
                                  ? group.group_specific_meal_times.map(time => <Badge key={time} variant="secondary" className="mr-1 mb-1">{time}</Badge>)
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
                         <div className="overflow-x-auto rounded-md border">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50">
                                    <tr>
                                        <th className="p-2 text-left font-semibold text-muted-foreground whitespace-nowrap">Ingredients Name</th>
                                        <th className="p-2 text-left font-semibold text-muted-foreground whitespace-nowrap">Preparation Types</th>
                                        <th className="p-2 text-left font-semibold text-muted-foreground whitespace-nowrap">Cut Sizes</th>
                                        <th className="p-2 text-left font-semibold text-muted-foreground whitespace-nowrap">Base UOM</th>
                                        {group.group_specific_meal_times.map(mealTime => (
                                            <th key={mealTime} className="p-2 text-left font-semibold text-muted-foreground whitespace-nowrap">{mealTime}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {group.ingredients.map((ingredient, ingIndex) => (
                                        <tr key={ingIndex} className="border-b last:border-b-0 hover:bg-muted/20">
                                            <td className="p-2 align-top whitespace-nowrap">{ingredient.ingredient_name}</td>
                                            <td className="p-2 align-top whitespace-nowrap">{ingredient.preparation_type_name || 'N/A'}</td>
                                            <td className="p-2 align-top whitespace-nowrap">{ingredient.cut_size_name || 'N/A'}</td>
                                            <td className="p-2 align-top whitespace-nowrap">{ingredient.base_uom_name}</td>
                                            {group.group_specific_meal_times.map(mealTime => (
                                                <td key={`${mealTime}-${ingIndex}`} className="p-2 align-top whitespace-nowrap">
                                                    {ingredient.quantities_by_meal_time[mealTime]?.toFixed(4) === '0.0000' ? '' : ingredient.quantities_by_meal_time[mealTime]?.toFixed(4) || ''}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                                 <tfoot className="bg-muted/50 font-semibold">
                                    {allUOMsInGroup.map(uom => (
                                        <tr key={`total-uom-${itemKey}-${uom}`}>
                                            <td className="p-2 text-right font-medium text-muted-foreground whitespace-nowrap" colSpan={4}>Total Qty Required ({uom}):</td>
                                            {group.group_specific_meal_times.map(mealTime => (
                                                <td key={`total-${mealTime}-${uom}`} className="p-2 text-left whitespace-nowrap">
                                                    {totalsByMealTimeAndUOM[mealTime]?.[uom]?.toFixed(4) === '0.0000' ? '' : totalsByMealTimeAndUOM[mealTime]?.[uom]?.toFixed(4) || ''}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                    <tr>
                                        <td className="p-2 font-medium text-muted-foreground whitespace-nowrap" colSpan={4}># of Animals</td>
                                        {group.group_specific_meal_times.map(mealTime => (
                                            <td key={`animals-${mealTime}`} className="p-2 text-left whitespace-nowrap">
                                                <Button variant="link" className="p-0 h-auto text-sm text-primary font-bold" onClick={() => openAnimalListModal(`Animals for ${group.choice_group_name} at ${mealTime}`, group.animals_per_meal_time[mealTime] || [])} disabled={(group.animals_per_meal_time[mealTime] || []).length === 0}>
                                                    {(group.animals_per_meal_time[mealTime] || []).length}
                                                </Button>
                                            </td>
                                        ))}
                                    </tr>
                                    <tr>
                                        <td className="p-2 font-medium text-muted-foreground whitespace-nowrap" colSpan={4}># of Species</td>
                                        {group.group_specific_meal_times.map(mealTime => (
                                            <td key={`species-${mealTime}`} className="p-2 text-left whitespace-nowrap">
                                                <Button variant="link" className="p-0 h-auto text-sm text-primary font-bold" onClick={() => openSpeciesListModal(`Species for ${group.choice_group_name} at ${mealTime}`, group.species_details_per_meal_time[mealTime] || [])} disabled={(group.species_details_per_meal_time[mealTime] || []).length === 0}>
                                                    {(group.species_details_per_meal_time[mealTime] || []).length}
                                                </Button>
                                            </td>
                                        ))}
                                    </tr>
                                    <tr>
                                        <td className="p-2 font-medium text-muted-foreground whitespace-nowrap" colSpan={4}># of Enclosures</td>
                                        {group.group_specific_meal_times.map(mealTime => (
                                            <td key={`enclosures-${mealTime}`} className="p-2 text-left whitespace-nowrap">
                                                 <Button variant="link" className="p-0 h-auto text-sm text-primary font-bold" onClick={() => openEnclosureListModal(`Enclosures for ${group.choice_group_name} at ${mealTime}`, group.enclosures_per_meal_time[mealTime] || [])} disabled={(group.enclosures_per_meal_time[mealTime] || []).length === 0}>
                                                    {(group.enclosures_per_meal_time[mealTime] || []).length}
                                                 </Button>
                                            </td>
                                        ))}
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
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
                  disabled={isGeneratingSummary || !dietData || isProcessingOverall || isProcessingDetailedRaw || isProcessingRecipes || isProcessingCombo || isProcessingChoice}
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

        <Dialog open={isAnimalListModalOpen} onOpenChange={setIsAnimalListModalOpen}>
          <DialogContent className="sm:max-w-md md:max-w-lg">
            <DialogHeader>
              <DialogTitle>{animalListModalTitle}</DialogTitle>
              <DialogDescription>
                List of unique animal IDs consuming this item.
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="h-[300px] w-full rounded-md border p-4 my-4">
              {animalListForModal.length > 0 ? (
                animalListForModal.map((animalId, idx) => (
                  <div key={idx} className="py-1 text-sm border-b last:border-b-0">
                    {animalId}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No specific animals recorded for this item.</p>
              )}
            </ScrollArea>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Close</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isEnclosureListModalOpen} onOpenChange={setIsEnclosureListModalOpen}>
          <DialogContent className="sm:max-w-md md:max-w-lg">
            <DialogHeader>
              <DialogTitle>{enclosureListModalTitle}</DialogTitle>
              <DialogDescription>
                List of unique enclosures associated with this item.
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="h-[300px] w-full rounded-md border p-4 my-4">
              {enclosureListForModal.length > 0 ? (
                enclosureListForModal.map((enclosureName, idx) => (
                  <div key={idx} className="py-1 text-sm border-b last:border-b-0">
                    {enclosureName}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No specific enclosures recorded for this item.</p>
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
