
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type {
  DietEntry, SiteIngredientsData, ColumnDefinition, DetailedRawMaterialData,
  ProcessedIngredientTotalsResult, GroupedByTypeIngredient,
  ProcessedRecipeDataResult, GroupedRecipe, RecipeIngredientItem,
  ProcessedComboIngredientsResult, GroupedComboIngredient, ComboIngredientItem,
  ProcessedChoiceIngredientsResult, GroupedChoiceIngredient, ChoiceIngredientItem, SpeciesConsumptionDetail,
  ProcessedDetailedRawMaterialResult
} from '@/types';
import {
  parseExcelFile, processOverallIngredientTotals, processDetailedRawMaterialTotals, processRecipeData,
  processComboIngredientUsage,
  getUniqueSiteNames,
  getUniqueSectionNames,
  getUniqueEnclosureNames,
  getUniqueSpeciesNames,
  getUniqueClassNames,
  processChoiceIngredientUsage,
  applyGlobalFilters, getGlobalCounts, getDynamicUniqueFilterOptions
} from '@/lib/excelParser';
import { Leaf, Utensils, Filter, Loader2, ChevronsUpDown, Download, Sunrise, Sun, CloudSun, CloudMoon, Clock, Sparkles, Info, Table as TableIcon } from 'lucide-react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import type { jsPDFDocument } from 'jspdf-autotable';
import { DataTable } from '@/components/DataTable';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableFooter as ShadTableFooter,
} from '@/components/ui/table';


const dayOptionsConfig = [
    { label: "7 Days", value: 7 },
    { label: "15 Days", value: 15 },
    { label: "30 Days", value: 30 },
];

const getDayOptions = (autoDetectedInputDuration: number) => {
    const options = [...dayOptionsConfig];
    const oneDayOption = { label: "1 Day", value: 1 };

    if (autoDetectedInputDuration === 7) {
        const filteredOptions = options.filter(opt => opt.value !== 1);
         if (!filteredOptions.some(opt => opt.value === 7)) {
            const sevenDayIndex = filteredOptions.findIndex(opt => opt.value === 7);
            if (sevenDayIndex === -1) {
                 filteredOptions.unshift({ label: "7 Days", value: 7 });
            }
        }
        return filteredOptions.sort((a,b) => a.value - b.value);
    } else {
         if (!options.some(opt => opt.value === 1)) {
          options.unshift(oneDayOption);
        }
        return options.sort((a,b) => a.value - b.value);
    }
};

const timeOfDaySegmentOptions = [
  { id: 'all_day', label: 'All Day', icon: Clock, startMinutes: 0, endMinutes: 1439 },
  { id: 'before_6am', label: 'Before 6 AM', icon: Sunrise, startMinutes: 0, endMinutes: 359 },
  { id: '6am_12pm', label: '6 AM to 12 PM', icon: Sun, startMinutes: 360, endMinutes: 719 },
  { id: '12pm_6pm', label: '12 PM to 6 PM', icon: CloudSun, startMinutes: 720, endMinutes: 1079 },
  { id: 'after_6pm', label: 'After 6 PM', icon: CloudMoon, startMinutes: 1080, endMinutes: 1439 },
];


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
  const [allSectionNames, setAllSectionNames] = useState<string[]>([]);
  const [allEnclosureNames, setAllEnclosureNames] = useState<string[]>([]);
  const [allSpeciesNames, setAllSpeciesNames] = useState<string[]>([]);
  const [allClassNames, setAllClassNames] = useState<string[]>([]);

  const [uniqueSiteNames, setUniqueSiteNames] = useState<string[]>([]);
  const [uniqueSectionNames, setUniqueSectionNames] = useState<string[]>([]);
  const [uniqueEnclosureNames, setUniqueEnclosureNames] = useState<string[]>([]);
  const [uniqueSpeciesNames, setUniqueSpeciesNames] = useState<string[]>([]);
  const [uniqueClassNames, setUniqueClassNames] = useState<string[]>([]);


  const [selectedSiteNames, setSelectedSiteNames] = useState<string[]>([]);
  const [selectedSectionNames, setSelectedSectionNames] = useState<string[]>([]);
  const [selectedEnclosureNames, setSelectedEnclosureNames] = useState<string[]>([]);
  const [selectedSpeciesNames, setSelectedSpeciesNames] = useState<string[]>([]);
  const [selectedClassNames, setSelectedClassNames] = useState<string[]>([]);
  const [selectedTimeSegmentId, setSelectedTimeSegmentId] = useState<string>('all_day');


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
  
  const [isIngredientListModalOpen, setIsIngredientListModalOpen] = useState(false);
  const [ingredientListModalTitle, setIngredientListModalTitle] = useState('');
  const [ingredientListForModal, setIngredientListForModal] = useState<string[]>([]);


  const [expandedSpeciesText, setExpandedSpeciesText] = useState<Record<string, boolean>>({});
  const [showSummary, setShowSummary] = useState(false);
  const [flattenedIngredientsSummaryData, setFlattenedIngredientsSummaryData] = useState<any[]>([]);
  const [ingredientsSummaryTotalsByUOM, setIngredientsSummaryTotalsByUOM] = useState<Record<string, number>>({});


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
  
  const openIngredientListModal = (title: string, ingredients: Array<{ ingredient_name: string }>) => {
    setIngredientListModalTitle(title);
    setIngredientListForModal(ingredients.map(ing => ing.ingredient_name));
    setIsIngredientListModalOpen(true);
  };


  const toggleSpeciesTextExpansion = (itemId: string) => {
    setExpandedSpeciesText(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const formatSpeciesDetails = (details: SpeciesConsumptionDetail[], limit?: number, forPdf: boolean = false): string => {
    if (!details || details.length === 0) return "";
    const toFormat = limit && details.length > limit && !forPdf ? details.slice(0, limit) : details;
    let formattedString = `(${toFormat.map(d => `${d.name} (${d.animal_count})`).join(', ')}`;
    if (limit && details.length > limit && !forPdf && details.length > limit) {
        formattedString += '...';
    }
    formattedString += ')';
    return formattedString;
  };

 const detailedRawMaterialColumns: ColumnDefinition<DetailedRawMaterialData>[] = useMemo(() => {
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
    setShowSummary(false);
    setFlattenedIngredientsSummaryData([]);
    setIngredientsSummaryTotalsByUOM({});

    setAllSiteNames([]);
    setAllSectionNames([]);
    setAllEnclosureNames([]);
    setAllClassNames([]);
    setAllSpeciesNames([]);
    setUniqueSiteNames([]);
    setUniqueSectionNames([]);
    setUniqueEnclosureNames([]);
    setUniqueClassNames([]);
    setUniqueSpeciesNames([]);

    setSelectedSiteNames([]);
    setSelectedSectionNames([]);
    setSelectedEnclosureNames([]);
    setSelectedSpeciesNames([]);
    setSelectedClassNames([]);
    setSelectedTimeSegmentId('all_day');
    setAutoDetectedInputDuration(1);
    setExpandedSpeciesText({});

    const currentDayOptions = getDayOptions(1);
    const defaultTargetDuration = currentDayOptions.find(opt => opt.value === 1)?.value || currentDayOptions[0]?.value || 1;
    setTargetDisplayDuration(defaultTargetDuration);
    
    setExcelMinDate(null);
    setExcelMaxDate(null);
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
      setDietData(parsedData);
      setAutoDetectedInputDuration(detectedInputDuration);
      setExcelMinDate(minDate);
      setExcelMaxDate(maxDate);

      setAllSiteNames(getUniqueSiteNames(parsedData));
      setAllSectionNames(getUniqueSectionNames(parsedData));
      setAllEnclosureNames(getUniqueEnclosureNames(parsedData));
      setAllSpeciesNames(getUniqueSpeciesNames(parsedData));
      setAllClassNames(getUniqueClassNames(parsedData));
      
      setUniqueSiteNames(getUniqueSiteNames(parsedData));
      setUniqueSectionNames(getUniqueSectionNames(parsedData));
      setUniqueEnclosureNames(getUniqueEnclosureNames(parsedData));
      setUniqueSpeciesNames(getUniqueSpeciesNames(parsedData));
      setUniqueClassNames(getUniqueClassNames(parsedData));

      const currentDayOptions = getDayOptions(detectedInputDuration);
      let newTargetDuration = targetDisplayDuration;

      if (detectedInputDuration === 7 && (newTargetDuration === 1 || !currentDayOptions.some(opt => opt.value === newTargetDuration))) {
         newTargetDuration = 7;
      } else if (detectedInputDuration === 1 && newTargetDuration > 1) {
        newTargetDuration = 1;
      } else if (!currentDayOptions.some(opt => opt.value === newTargetDuration)) {
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

      const currentSelectedTimeSegment = timeOfDaySegmentOptions.find(s => s.id === selectedTimeSegmentId);
      const timeSegmentFilterForProcessing = 
        currentSelectedTimeSegment && selectedTimeSegmentId !== 'all_day' 
        ? { startMinutes: currentSelectedTimeSegment.startMinutes, endMinutes: currentSelectedTimeSegment.endMinutes } 
        : null;

      const globallyFilteredData = applyGlobalFilters(
        dietData, 
        selectedSiteNames,
        selectedSectionNames, 
        selectedEnclosureNames, 
        selectedClassNames, 
        selectedSpeciesNames, 
        timeSegmentFilterForProcessing
      );
      const globalCounts = getGlobalCounts(globallyFilteredData);

      try {
        const overallResult = processOverallIngredientTotals(
          dietData, 
          globallyFilteredData, 
          globalCounts,
          autoDetectedInputDuration, 
          targetDisplayDuration
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
          globallyFilteredData, 
          globalCounts,
          autoDetectedInputDuration, 
          targetDisplayDuration
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
          globalCounts,
          autoDetectedInputDuration, 
          targetDisplayDuration
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
          globalCounts,
          autoDetectedInputDuration, 
          targetDisplayDuration
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
          globalCounts,
          autoDetectedInputDuration, 
          targetDisplayDuration
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
  }, [dietData, selectedSiteNames, selectedSectionNames, selectedEnclosureNames, selectedSpeciesNames, selectedClassNames, selectedTimeSegmentId, autoDetectedInputDuration, targetDisplayDuration]);


  useEffect(() => {
    if (!dietData) {
      setUniqueSiteNames(allSiteNames);
      setUniqueSectionNames(allSectionNames);
      setUniqueEnclosureNames(allEnclosureNames);
      setUniqueClassNames(allClassNames);
      setUniqueSpeciesNames(allSpeciesNames);
      return;
    }

    const currentSelectedTimeSegmentForDynamicOpts = timeOfDaySegmentOptions.find(s => s.id === selectedTimeSegmentId);
    const timeSegmentFilterForDynamicOptions = 
        currentSelectedTimeSegmentForDynamicOpts && selectedTimeSegmentId !== 'all_day' 
        ? { startMinutes: currentSelectedTimeSegmentForDynamicOpts.startMinutes, endMinutes: currentSelectedTimeSegmentForDynamicOpts.endMinutes } 
        : null;


    const currentFilters = {
        siteNames: selectedSiteNames,
        sectionNames: selectedSectionNames,
        enclosureNames: selectedEnclosureNames,
        classNames: selectedClassNames,
        speciesNames: selectedSpeciesNames,
        timeSegment: timeSegmentFilterForDynamicOptions,
    };

    setUniqueSiteNames(getDynamicUniqueFilterOptions(dietData, 'site_name', currentFilters));
    setUniqueSectionNames(getDynamicUniqueFilterOptions(dietData, 'section_name', currentFilters));
    setUniqueEnclosureNames(getDynamicUniqueFilterOptions(dietData, 'user_enclosure_name', currentFilters));
    setUniqueClassNames(getDynamicUniqueFilterOptions(dietData, 'class_name', currentFilters));
    setUniqueSpeciesNames(getDynamicUniqueFilterOptions(dietData, 'common_name', currentFilters));
    
  }, [dietData, selectedSiteNames, selectedSectionNames, selectedEnclosureNames, selectedClassNames, selectedSpeciesNames, selectedTimeSegmentId, allSiteNames, allSectionNames, allEnclosureNames, allClassNames, allSpeciesNames]);


  const formattedOverallIngredientsTitle = useMemo(() => {
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
    const doc = new jsPDF() as jsPDFDocument;
    let currentY = 15;
    const pageHeight = doc.internal.pageSize.getHeight();
    const bottomMargin = 20;
    const minSpaceForNewSection = 70;

    doc.setFontSize(16);
    doc.text(formattedOverallIngredientsTitle, 14, currentY);
    currentY += 8;

    displayableIngredientTotals.forEach((typeGroup, index) => {
      if (index > 0 && (currentY + minSpaceForNewSection > pageHeight - bottomMargin)) {
        doc.addPage(); currentY = 15; doc.setFontSize(16);
        doc.text(formattedOverallIngredientsTitle + " (cont.)", 14, currentY); currentY += 8;
      } else if (index > 0) {
        currentY += 10;
      }

      doc.setFontSize(12);
      let groupTitle = typeGroup.ingredient_type_name;
      const activeTimeSegment = timeOfDaySegmentOptions.find(s => s.id === selectedTimeSegmentId && s.id !== 'all_day');
       if (activeTimeSegment) {
         groupTitle += ` - ${activeTimeSegment.label}`;
       }
      doc.text(groupTitle, 14, currentY); currentY += 6;
      doc.setFontSize(8);

      let totalQtyText = "Total for " + targetDisplayDuration + " Day(s): ";
      const uomTotalsCombined = Object.entries(typeGroup.total_quantities_for_target_duration)
                                   .map(([uom, qty]) => `${qty.toFixed(2)} ${uom}`)
                                   .join(', ');
      doc.text(totalQtyText + (uomTotalsCombined || "N/A"), 14, currentY); currentY +=4;

      const speciesText = `Consuming Species: ${typeGroup.overall_consuming_species_details.length} ${formatSpeciesDetails(typeGroup.overall_consuming_species_details, undefined, true)}`;
      const textLineHeight = doc.getFontSize() * 1.2;
      const splitSpeciesText = doc.splitTextToSize(speciesText, doc.internal.pageSize.getWidth() - 28);
      doc.text(splitSpeciesText, 14, currentY); currentY += (splitSpeciesText.length * textLineHeight) + 2;

      doc.text(`Consuming Animals: ${typeGroup.overall_consuming_animals_count}`, 14, currentY); currentY += textLineHeight;
      doc.text(`Consuming Enclosures: ${typeGroup.overall_consuming_enclosures_count}`, 14, currentY); currentY += textLineHeight;
      
      const scheduledTimesString = typeGroup.scheduled_meal_times.length > 0 ? typeGroup.scheduled_meal_times.map(t => t.trim()).filter(Boolean).join(', ') : 'N/A';
      const mealTimesText = `Scheduled Meal Times: ${scheduledTimesString}`;
      const splitMealTimesText = doc.splitTextToSize(mealTimesText, doc.internal.pageSize.getWidth() - 28);
      doc.text(splitMealTimesText, 14, currentY); currentY += (splitMealTimesText.length * textLineHeight) + 2;

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
          const qtyStr = ing.quantities_by_meal_time[mt]?.toFixed(2);
          row[`qty_${mt}`] = qtyStr === '0.00' ? '' : qtyStr || '';
        });
        return row;
      });

      doc.autoTable({
        columns: ingredientTableColumns,
        body: ingredientTableRows,
        startY: currentY,
        theme: 'striped',
        headStyles: { fillColor: [75, 85, 99] },
        styles: { fontSize: 7, cellPadding: 1 },
      });
      currentY = (doc as any).lastAutoTable.finalY + 3;

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
              const qtyStr = uomTotalsForFooter[mt]?.[uom]?.toFixed(2);
              uomRow[mt] = qtyStr === '0.00' ? '' : qtyStr || '';
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

      doc.autoTable({
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
    const doc = new jsPDF() as jsPDFDocument;
    let currentY = 15;
    doc.setFontSize(16);
    let groupTitle = typeGroup.ingredient_type_name;
    const activeTimeSegment = timeOfDaySegmentOptions.find(s => s.id === selectedTimeSegmentId && s.id !== 'all_day');
    if (activeTimeSegment) {
       groupTitle += ` - ${activeTimeSegment.label}`;
     }
    doc.text(groupTitle, 14, currentY); currentY += 8;
    doc.setFontSize(8);

    let totalQtyText = "Total for " + targetDisplayDuration + " Day(s): ";
    const uomTotalsCombined = Object.entries(typeGroup.total_quantities_for_target_duration)
                                 .map(([uom, qty]) => `${qty.toFixed(2)} ${uom}`)
                                 .join(', ');
    doc.text(totalQtyText + (uomTotalsCombined || "N/A"), 14, currentY); currentY +=4;
    
    const speciesText = `Consuming Species: ${typeGroup.overall_consuming_species_details.length} ${formatSpeciesDetails(typeGroup.overall_consuming_species_details, undefined, true)}`;
    const textLineHeight = doc.getFontSize() * 1.2;
    const splitSpeciesText = doc.splitTextToSize(speciesText, doc.internal.pageSize.getWidth() - 28);
    doc.text(splitSpeciesText, 14, currentY); currentY += (splitSpeciesText.length * textLineHeight) + 2;

    doc.text(`Consuming Animals: ${typeGroup.overall_consuming_animals_count}`, 14, currentY); currentY += textLineHeight;
    doc.text(`Consuming Enclosures: ${typeGroup.overall_consuming_enclosures_count}`, 14, currentY); currentY += textLineHeight;
    
    const scheduledTimesString = typeGroup.scheduled_meal_times.length > 0 ? typeGroup.scheduled_meal_times.map(t => t.trim()).filter(Boolean).join(', ') : 'N/A';
    const mealTimesText = `Scheduled Meal Times: ${scheduledTimesString}`;
    const splitMealTimesText = doc.splitTextToSize(mealTimesText, doc.internal.pageSize.getWidth() - 28);
    doc.text(splitMealTimesText, 14, currentY); currentY += (splitMealTimesText.length * textLineHeight) + 2;

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
        const qtyStr = ing.quantities_by_meal_time[mt]?.toFixed(2);
        row[`qty_${mt}`] = qtyStr === '0.00' ? '' : qtyStr || '';
      });
      return row;
    });

    doc.autoTable({
      columns: ingredientTableColumns,
      body: ingredientTableRows,
      startY: currentY,
      theme: 'striped',
      headStyles: { fillColor: [75, 85, 99] },
      styles: { fontSize: 7, cellPadding: 1 },
    });
    currentY = (doc as any).lastAutoTable.finalY + 3;

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
             const qtyStr = uomTotalsForFooter[mt]?.[uom]?.toFixed(2);
             uomRow[mt] = qtyStr === '0.00' ? '' : qtyStr || '';
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

    doc.autoTable({
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

    const doc = new jsPDF() as jsPDFDocument;
    let currentY = 15;
    const pageHeight = doc.internal.pageSize.getHeight();
    const bottomMargin = 20;
    const minSpaceForNewSection = 70; 

    doc.setFontSize(16);
    doc.text(formattedRecipesTitle, 14, currentY);
    currentY += 7;

    displayableRecipes.forEach((recipe, index) => {
      if (index > 0 && (currentY + minSpaceForNewSection > pageHeight - bottomMargin)) {
        doc.addPage();
        currentY = 15;
        doc.setFontSize(16);
        doc.text(formattedRecipesTitle + " (cont.)", 14, currentY);
        currentY += 7;
      } else if (index > 0) {
        currentY += 10; 
      }

      doc.setFontSize(12);
      let recipeTitle = recipe.recipe_name;
      const activeTimeSegment = timeOfDaySegmentOptions.find(s => s.id === selectedTimeSegmentId && s.id !== 'all_day');
      if (activeTimeSegment) {
        recipeTitle += ` - ${activeTimeSegment.label}`;
      }
      doc.text(recipeTitle, 14, currentY);
      currentY += 6;
      doc.setFontSize(8);

      const textLineHeight = doc.getFontSize() * 1.2; 

      let totalQtyText = "";
      if (autoDetectedInputDuration === 7) {
        totalQtyText = `Total / Day: ${recipe.total_qty_per_day.toFixed(4)} ${recipe.base_uom_name}  |  Total for ${targetDisplayDuration} Days: ${recipe.total_qty_for_target_duration.toFixed(4)} ${recipe.base_uom_name}`;
      } else {
        totalQtyText = `Total for ${targetDisplayDuration} Day${targetDisplayDuration > 1 ? 's' : ''}: ${recipe.total_qty_for_target_duration.toFixed(4)} ${recipe.base_uom_name}`;
      }
      doc.text(totalQtyText, 14, currentY);
      currentY += textLineHeight;

      const speciesText = `Consuming Species: ${recipe.overall_consuming_species_details.length} ${formatSpeciesDetails(recipe.overall_consuming_species_details, undefined, true)}`;
      const splitSpeciesText = doc.splitTextToSize(speciesText, doc.internal.pageSize.getWidth() - 28);
      doc.text(splitSpeciesText, 14, currentY); currentY += (splitSpeciesText.length * textLineHeight) + 2;

      doc.text(`Consuming Animals: ${recipe.overall_consuming_animals_count}`, 14, currentY); currentY += textLineHeight;
      doc.text(`Consuming Enclosures: ${recipe.overall_consuming_enclosures_count}`, 14, currentY); currentY += textLineHeight;

      const scheduledTimesString = recipe.scheduled_meal_times.length > 0 ? recipe.scheduled_meal_times.map(t => t.trim()).filter(Boolean).join(', ') : 'N/A';
      const mealTimesText = `Scheduled Meal Times: ${scheduledTimesString}`;
      const splitMealTimesText = doc.splitTextToSize(mealTimesText, doc.internal.pageSize.getWidth() - 28);
      doc.text(splitMealTimesText, 14, currentY);
      currentY += (splitMealTimesText.length * textLineHeight) + 2;

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
           const qtyStr = ing.quantities_by_meal_time[mt]?.toFixed(4);
           row[`qty_${mt}`] = qtyStr === '0.0000' ? '' : qtyStr || '';
        });
        return row;
      });

      doc.autoTable({
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
              const qtyStr = uomTotals[mt]?.[uom]?.toFixed(4);
              uomRow[mt] = qtyStr === '0.0000' ? '' : qtyStr || '';
          });
          summaryTableBody.push(uomRow);
      });

      const animalRow: any = { metric: "# of Animals" };
      recipe.group_specific_meal_times.forEach(mt => {
        animalRow[mt] = (recipe.animals_per_meal_time[mt] || []).length.toString();
      });
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

      doc.autoTable({
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

    const doc = new jsPDF() as jsPDFDocument;
    let currentY = 15;

    doc.setFontSize(16);
    let recipeTitle = recipe.recipe_name;
    const activeTimeSegment = timeOfDaySegmentOptions.find(s => s.id === selectedTimeSegmentId && s.id !== 'all_day');
    if (activeTimeSegment) {
      recipeTitle += ` - ${activeTimeSegment.label}`;
    }
    doc.text(recipeTitle, 14, currentY);
    currentY += 7;
    doc.setFontSize(8);
    const textLineHeight = doc.getFontSize() * 1.2;

    let totalQtyText = "";
    if (autoDetectedInputDuration === 7) {
      totalQtyText = `Total / Day: ${recipe.total_qty_per_day.toFixed(4)} ${recipe.base_uom_name}  |  Total for ${targetDisplayDuration} Days: ${recipe.total_qty_for_target_duration.toFixed(4)} ${recipe.base_uom_name}`;
    } else {
      totalQtyText = `Total for ${targetDisplayDuration} Day${targetDisplayDuration > 1 ? 's' : ''}: ${recipe.total_qty_for_target_duration.toFixed(4)} ${recipe.base_uom_name}`;
    }
    doc.text(totalQtyText, 14, currentY);
    currentY += textLineHeight;

    const speciesText = `Consuming Species: ${recipe.overall_consuming_species_details.length} ${formatSpeciesDetails(recipe.overall_consuming_species_details, undefined, true)}`;
    const splitSpeciesText = doc.splitTextToSize(speciesText, doc.internal.pageSize.getWidth() - 28);
    doc.text(splitSpeciesText, 14, currentY); currentY += (splitSpeciesText.length * textLineHeight) + 2;

    doc.text(`Consuming Animals: ${recipe.overall_consuming_animals_count}`, 14, currentY); currentY += textLineHeight;
    doc.text(`Consuming Enclosures: ${recipe.overall_consuming_enclosures_count}`, 14, currentY); currentY += textLineHeight;

    const scheduledTimesString = recipe.scheduled_meal_times.length > 0 ? recipe.scheduled_meal_times.map(t => t.trim()).filter(Boolean).join(', ') : 'N/A';
    const mealTimesText = `Scheduled Meal Times: ${scheduledTimesString}`;
    const splitMealTimesText = doc.splitTextToSize(mealTimesText, doc.internal.pageSize.getWidth() - 28);
    doc.text(splitMealTimesText, 14, currentY);
    currentY += (splitMealTimesText.length * textLineHeight) + 2;

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
            const qtyStr = ing.quantities_by_meal_time[mt]?.toFixed(4);
            row[`qty_${mt}`] = qtyStr === '0.0000' ? '' : qtyStr || '';
        });
        return row;
    });

    doc.autoTable({
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
            const qtyStr = uomTotals[mt]?.[uom]?.toFixed(4);
            uomRow[mt] = qtyStr === '0.0000' ? '' : qtyStr || '';
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

    doc.autoTable({
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
    const doc = new jsPDF() as jsPDFDocument;
    let currentY = 15;
    const pageHeight = doc.internal.pageSize.getHeight();
    const bottomMargin = 20;
    const minSpaceForNewSection = 70;

    doc.setFontSize(16);
    doc.text(formattedComboTitle, 14, currentY);
    currentY += 8;

    displayableCombos.forEach((group, index) => {
      if (index > 0 && (currentY + minSpaceForNewSection > pageHeight - bottomMargin)) {
        doc.addPage();
        currentY = 15;
        doc.setFontSize(16);
        doc.text(formattedComboTitle + " (cont.)", 14, currentY);
        currentY += 8;
      } else if (index > 0) {
         currentY += 10;
      }

      doc.setFontSize(12);
      let groupTitle = group.combo_group_name;
       const activeTimeSegment = timeOfDaySegmentOptions.find(s => s.id === selectedTimeSegmentId && s.id !== 'all_day');
      if (activeTimeSegment) {
        groupTitle += ` - ${activeTimeSegment.label}`;
      }
      doc.text(groupTitle, 14, currentY);
      currentY += 6;
      doc.setFontSize(8);
      const textLineHeight = doc.getFontSize() * 1.2;

      const speciesText = `Consuming Species: ${group.overall_consuming_species_details.length} ${formatSpeciesDetails(group.overall_consuming_species_details, undefined, true)}`;
      const splitSpeciesText = doc.splitTextToSize(speciesText, doc.internal.pageSize.getWidth() - 28);
      doc.text(splitSpeciesText, 14, currentY); currentY += (splitSpeciesText.length * textLineHeight) + 2;

      doc.text(`Consuming Animals: ${group.overall_consuming_animals_count}`, 14, currentY); currentY += textLineHeight;
      doc.text(`Consuming Enclosures: ${group.overall_consuming_enclosures_count}`, 14, currentY); currentY += textLineHeight;
      
      const scheduledTimesString = group.group_specific_meal_times.length > 0 ? group.group_specific_meal_times.join(', ') : 'N/A'; 
      const mealTimesText = `Scheduled Meal Times: ${scheduledTimesString}`;
      const splitMealTimesText = doc.splitTextToSize(mealTimesText, doc.internal.pageSize.getWidth() - 28);
      doc.text(splitMealTimesText, 14, currentY);
      currentY += (splitMealTimesText.length * textLineHeight) + 2;

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
          const qtyStr = ing.quantities_by_meal_time[mt]?.toFixed(4);
          row[`qty_${mt}`] = qtyStr === '0.0000' ? '' : qtyStr || '';
        });
        return row;
      });

      doc.autoTable({
        columns: ingredientTableColumns,
        body: ingredientTableRows,
        startY: currentY,
        theme: 'striped',
        headStyles: { fillColor: [75, 85, 99] },
        styles: { fontSize: 7, cellPadding: 1 },
      });
      currentY = (doc as any).lastAutoTable.finalY + 3;

      const summaryTableBody: any[] = [];
      const uomTotalsForFooter: Record<string, Record<string, number>> = {};
      group.group_specific_meal_times.forEach(mt => {
        uomTotalsForFooter[mt] = {};
        group.ingredients.forEach(ing => {
          const qty = ing.quantities_by_meal_time[mt] || 0;
          uomTotalsForFooter[mt][ing.base_uom_name] = (uomTotalsForFooter[mt][ing.base_uom_name] || 0) + qty;
        });
      });
      
      const allUOMs = Array.from(new Set(group.ingredients.map(i => i.base_uom_name))).sort();
      allUOMs.forEach(uom => {
          const uomRow: any = { metric: `Total Qty Required (${uom}):` };
          group.group_specific_meal_times.forEach(mt => {
             const qtyStr = uomTotalsForFooter[mt]?.[uom]?.toFixed(4);
             uomRow[mt] = qtyStr === '0.0000' ? '' : qtyStr || '';
          });
          summaryTableBody.push(uomRow);
      });
      
      const animalRow: any = { metric: "# of Animals" };
      group.group_specific_meal_times.forEach(mt => {
        animalRow[mt] = (group.animals_per_meal_time[mt] || []).length.toString();
      });
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

      doc.autoTable({
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
    const doc = new jsPDF() as jsPDFDocument;
    let currentY = 15;

    doc.setFontSize(16);
    let groupTitle = group.combo_group_name;
    const activeTimeSegment = timeOfDaySegmentOptions.find(s => s.id === selectedTimeSegmentId && s.id !== 'all_day');
    if (activeTimeSegment) {
        groupTitle += ` - ${activeTimeSegment.label}`;
    }
    doc.text(groupTitle, 14, currentY);
    currentY += 8;
    doc.setFontSize(8);
    const textLineHeight = doc.getFontSize() * 1.2;

    const speciesText = `Consuming Species: ${group.overall_consuming_species_details.length} ${formatSpeciesDetails(group.overall_consuming_species_details, undefined, true)}`;
    const splitSpeciesText = doc.splitTextToSize(speciesText, doc.internal.pageSize.getWidth() - 28);
    doc.text(splitSpeciesText, 14, currentY); currentY += (splitSpeciesText.length * textLineHeight) + 2;
    
    doc.text(`Consuming Animals: ${group.overall_consuming_animals_count}`, 14, currentY); currentY += textLineHeight;
    doc.text(`Consuming Enclosures: ${group.overall_consuming_enclosures_count}`, 14, currentY); currentY += textLineHeight;

    const scheduledTimesString = group.group_specific_meal_times.length > 0 ? group.group_specific_meal_times.join(', ') : 'N/A';
    const mealTimesText = `Scheduled Meal Times: ${scheduledTimesString}`;
    const splitMealTimesText = doc.splitTextToSize(mealTimesText, doc.internal.pageSize.getWidth() - 28);
    doc.text(splitMealTimesText, 14, currentY);
    currentY += (splitMealTimesText.length * textLineHeight) + 2;

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
            const qtyStr = ing.quantities_by_meal_time[mt]?.toFixed(4);
            row[`qty_${mt}`] = qtyStr === '0.0000' ? '' : qtyStr || '';
        });
        return row;
    });

    doc.autoTable({
        columns: ingredientTableColumns,
        body: ingredientTableRows,
        startY: currentY,
        theme: 'striped',
        headStyles: { fillColor: [75, 85, 99] },
        styles: { fontSize: 7, cellPadding: 1 },
    });
    currentY = (doc as any).lastAutoTable.finalY + 3;

    const summaryTableBody: any[] = [];
    const uomTotalsForFooter: Record<string, Record<string, number>> = {};
      group.group_specific_meal_times.forEach(mt => {
        uomTotalsForFooter[mt] = {};
        group.ingredients.forEach(ing => {
          const qty = ing.quantities_by_meal_time[mt] || 0;
          uomTotalsForFooter[mt][ing.base_uom_name] = (uomTotalsForFooter[mt][ing.base_uom_name] || 0) + qty;
        });
      });
      
    const allUOMs = Array.from(new Set(group.ingredients.map(i => i.base_uom_name))).sort();
    allUOMs.forEach(uom => {
        const uomRow: any = { metric: `Total Qty Required (${uom}):` };
        group.group_specific_meal_times.forEach(mt => {
            const qtyStr = uomTotalsForFooter[mt]?.[uom]?.toFixed(4);
            uomRow[mt] = qtyStr === '0.0000' ? '' : qtyStr || '';
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

    doc.autoTable({
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

    const doc = new jsPDF() as jsPDFDocument;
    let currentY = 15;
    const pageHeight = doc.internal.pageSize.getHeight();
    const bottomMargin = 20;
    const minSpaceForNewSection = 70;

    doc.setFontSize(16);
    doc.text(formattedChoiceTitle, 14, currentY);
    currentY += 8;

    displayableChoices.forEach((group, index) => {
      if (index > 0 && (currentY + minSpaceForNewSection > pageHeight - bottomMargin)) {
        doc.addPage(); currentY = 15; doc.setFontSize(16);
        doc.text(formattedChoiceTitle + " (cont.)", 14, currentY); currentY += 8;
      } else if (index > 0) {
        currentY +=10;
      }

      doc.setFontSize(12);
      let groupTitle = group.choice_group_name;
      const activeTimeSegment = timeOfDaySegmentOptions.find(s => s.id === selectedTimeSegmentId && s.id !== 'all_day');
      if (activeTimeSegment) {
        groupTitle += ` - ${activeTimeSegment.label}`;
      }
      doc.text(groupTitle, 14, currentY);
      currentY += 6;
      doc.setFontSize(8);
      const textLineHeight = doc.getFontSize() * 1.2;

      const speciesText = `Consuming Species: ${group.overall_consuming_species_details.length} ${formatSpeciesDetails(group.overall_consuming_species_details, undefined, true)}`;
      const splitSpeciesText = doc.splitTextToSize(speciesText, doc.internal.pageSize.getWidth() - 28);
      doc.text(splitSpeciesText, 14, currentY); currentY += (splitSpeciesText.length * textLineHeight) + 2;
      
      doc.text(`Consuming Animals: ${group.overall_consuming_animals_count}`, 14, currentY); currentY += textLineHeight;
      doc.text(`Consuming Enclosures: ${group.overall_consuming_enclosures_count}`, 14, currentY); currentY += textLineHeight;
      
      const scheduledTimesString = group.group_specific_meal_times.length > 0 ? group.group_specific_meal_times.join(', ') : 'N/A';
      const mealTimesText = `Scheduled Meal Times: ${scheduledTimesString}`;
      const splitMealTimesText = doc.splitTextToSize(mealTimesText, doc.internal.pageSize.getWidth() - 28);
      doc.text(splitMealTimesText, 14, currentY);
      currentY += (splitMealTimesText.length * textLineHeight) + 2;

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
              const qtyStr = ing.quantities_by_meal_time[mt]?.toFixed(4);
              row[`qty_${mt}`] = qtyStr === '0.0000' ? '' : qtyStr || '';
          });
          return row;
      });

      doc.autoTable({
          columns: ingredientTableColumns,
          body: ingredientTableRows,
          startY: currentY,
          theme: 'striped',
          headStyles: { fillColor: [75, 85, 99] },
          styles: { fontSize: 7, cellPadding: 1 },
      });
      currentY = (doc as any).lastAutoTable.finalY + 3;

      const summaryTableBody: any[] = [];
      const uomTotalsForFooter: Record<string, Record<string, number>> = {};
      group.group_specific_meal_times.forEach(mt => {
        uomTotalsForFooter[mt] = {};
        group.ingredients.forEach(ing => {
          const qty = ing.quantities_by_meal_time[mt] || 0;
          uomTotalsForFooter[mt][ing.base_uom_name] = (uomTotalsForFooter[mt][ing.base_uom_name] || 0) + qty;
        });
      });
      
      const allUOMs = Array.from(new Set(group.ingredients.map(i => i.base_uom_name))).sort();
      allUOMs.forEach(uom => {
          const uomRow: any = { metric: `Total Qty Required (${uom}):` };
          group.group_specific_meal_times.forEach(mt => {
              const qtyStr = uomTotalsForFooter[mt]?.[uom]?.toFixed(4);
              uomRow[mt] = qtyStr === '0.0000' ? '' : qtyStr || '';
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

      doc.autoTable({
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
    const doc = new jsPDF() as jsPDFDocument;
    let currentY = 15;
    doc.setFontSize(16);
    let groupTitle = group.choice_group_name;
    const activeTimeSegment = timeOfDaySegmentOptions.find(s => s.id === selectedTimeSegmentId && s.id !== 'all_day');
    if (activeTimeSegment) {
        groupTitle += ` - ${activeTimeSegment.label}`;
    }
    doc.text(groupTitle, 14, currentY);
    currentY += 8;
    doc.setFontSize(8);
    const textLineHeight = doc.getFontSize() * 1.2;
    
    const speciesText = `Consuming Species: ${group.overall_consuming_species_details.length} ${formatSpeciesDetails(group.overall_consuming_species_details, undefined, true)}`;
    const splitSpeciesText = doc.splitTextToSize(speciesText, doc.internal.pageSize.getWidth() - 28);
    doc.text(splitSpeciesText, 14, currentY); currentY += (splitSpeciesText.length * textLineHeight) + 2;

    doc.text(`Consuming Animals: ${group.overall_consuming_animals_count}`, 14, currentY); currentY += textLineHeight;
    doc.text(`Consuming Enclosures: ${group.overall_consuming_enclosures_count}`, 14, currentY); currentY += textLineHeight;

    const scheduledTimesString = group.group_specific_meal_times.length > 0 ? group.group_specific_meal_times.join(', ') : 'N/A';
    const mealTimesText = `Scheduled Meal Times: ${scheduledTimesString}`;
    const splitMealTimesText = doc.splitTextToSize(mealTimesText, doc.internal.pageSize.getWidth() - 28);
    doc.text(splitMealTimesText, 14, currentY);
    currentY += (splitMealTimesText.length * textLineHeight) + 2;

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
            const qtyStr = ing.quantities_by_meal_time[mt]?.toFixed(4);
            row[`qty_${mt}`] = qtyStr === '0.0000' ? '' : qtyStr || '';
        });
        return row;
    });

    doc.autoTable({
        columns: ingredientTableColumns,
        body: ingredientTableRows,
        startY: currentY,
        theme: 'striped',
        headStyles: { fillColor: [75, 85, 99] },
        styles: { fontSize: 7, cellPadding: 1 },
    });
    currentY = (doc as any).lastAutoTable.finalY + 3;

    const summaryTableBody: any[] = [];
    const uomTotalsForFooter: Record<string, Record<string, number>> = {};
      group.group_specific_meal_times.forEach(mt => {
        uomTotalsForFooter[mt] = {};
        group.ingredients.forEach(ing => {
          const qty = ing.quantities_by_meal_time[mt] || 0;
          uomTotalsForFooter[mt][ing.base_uom_name] = (uomTotalsForFooter[mt][ing.base_uom_name] || 0) + qty;
        });
      });
      
    const allUOMs = Array.from(new Set(group.ingredients.map(i => i.base_uom_name))).sort();
    allUOMs.forEach(uom => {
        const uomRow: any = { metric: `Total Qty Required (${uom}):` };
        group.group_specific_meal_times.forEach(mt => {
            const qtyStr = uomTotalsForFooter[mt]?.[uom]?.toFixed(4);
            uomRow[mt] = qtyStr === '0.0000' ? '' : qtyStr || '';
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

    doc.autoTable({
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


   const handleSummaryPdfDownload = () => {
    if (!showSummary || !dietData) {
      alert("Please generate the summary first or upload data.");
      return;
    }

    const doc = new jsPDF() as jsPDFDocument;
    let currentY = 15;
    const pageHeight = doc.internal.pageSize.getHeight();
    const bottomMargin = 20;

    doc.setFontSize(16);
    doc.text("Diet Plan Summary Report", 14, currentY);
    currentY += 10;

    const addSectionToPdf = (title: string, data: any[], columns: ColumnDefinition<any>[], totalCount?: number, customFooterRows?: any[][], footerColSpans?: number[]) => {
      if (currentY + 40 > pageHeight - bottomMargin) { 
        doc.addPage();
        currentY = 15;
      }
      doc.setFontSize(12);
      doc.text(title, 14, currentY);
      currentY += 6;
      if (totalCount !== undefined) {
        doc.setFontSize(10);
        doc.text(`Total Count: ${totalCount}`, 14, currentY);
        currentY += 6;
      }

      if (data && data.length > 0) {
        const tableBody = data.map(row =>
          columns.map(col => {
            const val = col.cell ? col.cell(row) : (row as any)[col.key];
            return String(val !== undefined ? val : '');
          })
        );
        doc.autoTable({
          head: [columns.map(col => col.header)],
          body: tableBody,
          startY: currentY,
          theme: 'striped',
          headStyles: { fillColor: [75, 85, 99] },
          styles: { fontSize: 8, cellPadding: 1.5 },
          didDrawPage: (hookData: any) => { 
            currentY = hookData.cursor?.y ? hookData.cursor.y + 5 : 20;
          }
        });
        let lastY = (doc as any).lastAutoTable.finalY; 
        if (customFooterRows && customFooterRows.length > 0) {
            doc.autoTable({
                body: customFooterRows,
                startY: lastY,
                theme: 'grid',
                styles: { fontSize: 7, fontStyle: 'bold', cellPadding: 1.5 },
                columnStyles: { 0: { cellWidth: 'auto', colSpan: footerColSpans ? footerColSpans[0] : 1 } }, 
            });
             lastY = (doc as any).lastAutoTable.finalY;
        }
        currentY = lastY + 10;

      } else {
        doc.setFontSize(10);
        doc.text("No data available for this section.", 14, currentY);
        currentY += 10;
      }
    };

    const flatIngredientsForSummaryPdf = overallIngredientsData?.data.flatMap(typeGroup => 
        typeGroup.ingredients.map(ing => {
            let totalQtyAcrossMeals = 0;
            Object.values(ing.quantities_by_meal_time).forEach(qty => totalQtyAcrossMeals += qty);
            return {
                ingredient_type_name: typeGroup.ingredient_type_name,
                ingredient_name: ing.ingredient_name,
                preparation_type_name: ing.preparation_type_name || 'N/A',
                cut_size_name: ing.cut_size_name || 'N/A',
                total_qty_for_target_duration_across_meal_times: totalQtyAcrossMeals,
                base_uom_name: ing.base_uom_name,
            };
        })
    ) || [];
    
    const ingredientsSummaryTotalsUOM: Record<string, number> = {};
    flatIngredientsForSummaryPdf.forEach(ing => {
        ingredientsSummaryTotalsUOM[ing.base_uom_name] = (ingredientsSummaryTotalsUOM[ing.base_uom_name] || 0) + ing.total_qty_for_target_duration_across_meal_times;
    });
    const ingredientsFooterRows = Object.entries(ingredientsSummaryTotalsUOM).map(([uom, total]) => [
        `Total Qty Required (${uom}):`, total.toFixed(2)
    ]);
    
    addSectionToPdf("Ingredients Summary", flatIngredientsForSummaryPdf, columnsForIngredientsSummary, flatIngredientsForSummaryPdf.length, ingredientsFooterRows, [columnsForIngredientsSummary.length -1]);


    const recipesForPdf = recipesData?.data || [];
    const recipesFooterUOMs: Record<string, number> = {};
    recipesForPdf.forEach(recipe => {
        recipe.ingredients.forEach(ing => {
            recipesFooterUOMs[ing.base_uom_name] = (recipesFooterUOMs[ing.base_uom_name] || 0) + ing.total_qty_for_target_duration_across_meal_times;
        });
    });
    const recipesFooterRows = Object.entries(recipesFooterUOMs).map(([uom, total]) => [
        `Total Qty Required (${uom}):`, total.toFixed(4)
    ]);
    addSectionToPdf("Recipes Summary", recipesForPdf, summaryRecipesColumns, recipesForPdf.length, recipesFooterRows, [summaryRecipesColumns.length - 2]); 
    
    const combosForPdf = comboIngredientsData?.data || [];
    const combosFooterUOMs: Record<string, number> = {};
    combosForPdf.forEach(group => {
        group.ingredients.forEach(ing => {
            combosFooterUOMs[ing.base_uom_name] = (combosFooterUOMs[ing.base_uom_name] || 0) + ing.total_qty_for_target_duration_across_meal_times;
        });
    });
    const combosFooterRows = Object.entries(combosFooterUOMs).map(([uom, total]) => [
        `Total Qty Required (${uom}):`, total.toFixed(4)
    ]);
    addSectionToPdf("Combo Ingredients Summary", combosForPdf, summaryCombosColumns, combosForPdf.length, combosFooterRows, [summaryCombosColumns.length - 2]); 

    const choicesForPdf = choiceIngredientsData?.data || [];
    const choicesFooterUOMs: Record<string, number> = {};
    choicesForPdf.forEach(group => {
        group.ingredients.forEach(ing => {
            choicesFooterUOMs[ing.base_uom_name] = (choicesFooterUOMs[ing.base_uom_name] || 0) + ing.total_qty_for_target_duration_across_meal_times;
        });
    });
     const choicesFooterRows = Object.entries(choicesFooterUOMs).map(([uom, total]) => [
        `Total Qty Required (${uom}):`, total.toFixed(4)
    ]);
    addSectionToPdf("Choice Ingredients Summary", choicesForPdf, summaryChoicesColumns, choicesForPdf.length, choicesFooterRows, [summaryChoicesColumns.length - 2]); 

    doc.save('diet_summary_report.pdf');
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
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
            {renderMultiSelectFilter(
              "Site Name", uniqueSiteNames, selectedSiteNames, setSelectedSiteNames,
              "All Sites", "site-filter", !dietData || isLoading || isTabProcessing
            )}
            {renderMultiSelectFilter(
              "Section Name", uniqueSectionNames, selectedSectionNames, setSelectedSectionNames,
              "All Sections", "section-filter", !dietData || isLoading || isTabProcessing
            )}
            {renderMultiSelectFilter(
              "Enclosure Name", uniqueEnclosureNames, selectedEnclosureNames, setSelectedEnclosureNames,
              "All Enclosures", "enclosure-filter", !dietData || isLoading || isTabProcessing
            )}
            {renderMultiSelectFilter(
              "Class Name", uniqueClassNames, selectedClassNames, setSelectedClassNames,
              "All Classes", "class-filter", !dietData || isLoading || isTabProcessing
            )}
            {renderMultiSelectFilter(
              "Species Name (Common)", uniqueSpeciesNames, selectedSpeciesNames, setSelectedSpeciesNames,
              "All Species", "species-filter", !dietData || isLoading || isTabProcessing
            )}
          </div>
          <div className="flex flex-col md:flex-row gap-4 md:gap-8 items-start pt-4">
             <div className="flex-1 space-y-1">
                <Label htmlFor="time-segment-buttons" className="text-sm font-medium">Filter by Time of Day:</Label>
                <div id="time-segment-buttons" className="flex flex-wrap gap-2">
                    {timeOfDaySegmentOptions.map(option => (
                        <Button
                            key={option.id}
                            variant={selectedTimeSegmentId === option.id ? "default" : "outline"}
                            onClick={() => setSelectedTimeSegmentId(option.id)}
                            disabled={!dietData || isLoading || isTabProcessing}
                            className="flex-grow sm:flex-grow-0 min-w-[100px] h-auto py-2 px-3 text-sm"
                        >
                          <div className="flex flex-col items-center gap-1">
                            <option.icon className="h-5 w-5" />
                            <span className="font-bold text-xs text-center">{option.label}</span>
                          </div>
                        </Button>
                    ))}
                </div>
            </div>
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
                      !dietData || isLoading || isTabProcessing ||
                      (autoDetectedInputDuration === 1 && option.value > 1 && option.value !==1)
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

      {dietData && currentData && !isTabProcessing && (
        <Card className="shadow-md">
           <CardHeader>
              <CardTitle className="text-xl text-primary">Filtered Summary</CardTitle>
            </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <p><span className="font-semibold text-muted-foreground">Total Animals:</span> <span className="font-bold">{currentData.totalAnimals || 0}</span></p>
              <p><span className="font-semibold text-muted-foreground">Total Species:</span> <span className="font-bold">{currentData.totalSpecies || 0}</span></p>
            </div>
          </CardContent>
        </Card>
      )}
       {isTabProcessing && dietData && (
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

  const columnsForIngredientsSummary: ColumnDefinition<ReturnType<typeof flattenedIngredientsSummaryData>[0]>[] = useMemo(() => [
    { key: 'ingredient_type_name', header: 'Ingredient Type' },
    { key: 'ingredient_name', header: 'Ingredient Name' },
    { key: 'preparation_type_name', header: 'Preparation Type' },
    { key: 'cut_size_name', header: 'Cut Size' },
    { 
      key: 'total_qty_for_target_duration_across_meal_times', 
      header: `Total Qty for ${targetDisplayDuration} Day(s)`,
      cell: (item) => item.total_qty_for_target_duration_across_meal_times.toFixed(2)
    },
    { key: 'base_uom_name', header: 'Base UOM' },
  ], [targetDisplayDuration]);

  const summaryRecipesColumns: ColumnDefinition<GroupedRecipe>[] = useMemo(() => [
    { key: 'recipe_name', header: 'Recipe Name' },
    { 
      key: 'ingredients.length', 
      header: 'Number of Ingredients',
      cell: (item) => (
        <Button variant="link" className="p-0 h-auto" onClick={() => openIngredientListModal(`Ingredients for ${item.recipe_name}`, item.ingredients)}>
          {item.ingredients.length}
        </Button>
      )
    },
    { 
      key: 'overall_consuming_species_details.length', 
      header: 'Overall Consuming Species',
      cell: (item) => (
        <Button variant="link" className="p-0 h-auto" onClick={() => openSpeciesListModal(`Species consuming ${item.recipe_name}`, item.overall_consuming_species_details)}>
            {item.overall_consuming_species_details.length}
        </Button>
      )
    },
     { 
      key: 'overall_consuming_enclosures_count', 
      header: 'Overall Consuming Enclosures',
      cell: (item) => (
        <Button variant="link" className="p-0 h-auto" onClick={() => openEnclosureListModal(`Enclosures for ${item.recipe_name}`, item.overall_consuming_enclosures)}>
            {item.overall_consuming_enclosures_count}
        </Button>
      )
    },
  ], []);

  const summaryCombosColumns: ColumnDefinition<GroupedComboIngredient>[] = useMemo(() => [
    { key: 'combo_group_name', header: 'Combo Name' },
    { 
      key: 'ingredients.length', 
      header: 'Number of Ingredients',
      cell: (item) => (
         <Button variant="link" className="p-0 h-auto" onClick={() => openIngredientListModal(`Ingredients for ${item.combo_group_name}`, item.ingredients)}>
            {item.ingredients.length}
        </Button>
      )
    },
    { 
      key: 'overall_consuming_species_details.length', 
      header: 'Overall Consuming Species',
      cell: (item) => (
         <Button variant="link" className="p-0 h-auto" onClick={() => openSpeciesListModal(`Species consuming ${item.combo_group_name}`, item.overall_consuming_species_details)}>
            {item.overall_consuming_species_details.length}
        </Button>
      )
    },
    { 
      key: 'overall_consuming_enclosures_count', 
      header: 'Overall Consuming Enclosures',
      cell: (item) => (
        <Button variant="link" className="p-0 h-auto" onClick={() => openEnclosureListModal(`Enclosures for ${item.combo_group_name}`, item.overall_consuming_enclosures)}>
            {item.overall_consuming_enclosures_count}
        </Button>
      )
    },
  ], []);

  const summaryChoicesColumns: ColumnDefinition<GroupedChoiceIngredient>[] = useMemo(() => [
    { key: 'choice_group_name', header: 'Choice Group' },
    { 
      key: 'ingredients.length', 
      header: 'Number of Ingredient Options',
      cell: (item) => (
        <Button variant="link" className="p-0 h-auto" onClick={() => openIngredientListModal(`Ingredients for ${item.choice_group_name}`, item.ingredients)}>
            {item.ingredients.length}
        </Button>
      )
    },
    { 
      key: 'overall_consuming_species_details.length', 
      header: 'Overall Consuming Species',
      cell: (item) => (
         <Button variant="link" className="p-0 h-auto" onClick={() => openSpeciesListModal(`Species consuming ${item.choice_group_name}`, item.overall_consuming_species_details)}>
            {item.overall_consuming_species_details.length}
        </Button>
      )
    },
    { 
      key: 'overall_consuming_enclosures_count', 
      header: 'Overall Consuming Enclosures',
      cell: (item) => (
        <Button variant="link" className="p-0 h-auto" onClick={() => openEnclosureListModal(`Enclosures for ${item.choice_group_name}`, item.overall_consuming_enclosures)}>
            {item.overall_consuming_enclosures_count}
        </Button>
      )
    },
  ], []);

  useEffect(() => {
    if (overallIngredientsData?.data) {
      const flatData = overallIngredientsData.data.flatMap(typeGroup =>
        typeGroup.ingredients.map(ing => {
          let totalQtyAcrossMeals = 0;
          Object.values(ing.quantities_by_meal_time).forEach(qty => totalQtyAcrossMeals += qty);
          return {
            ingredient_type_name: typeGroup.ingredient_type_name,
            ingredient_name: ing.ingredient_name,
            preparation_type_name: ing.preparation_type_name || 'N/A',
            cut_size_name: ing.cut_size_name || 'N/A',
            total_qty_for_target_duration_across_meal_times: totalQtyAcrossMeals,
            base_uom_name: ing.base_uom_name,
          };
        })
      );
      setFlattenedIngredientsSummaryData(flatData);

      const totalsByUOM: Record<string, number> = {};
      flatData.forEach(ing => {
        totalsByUOM[ing.base_uom_name] = (totalsByUOM[ing.base_uom_name] || 0) + ing.total_qty_for_target_duration_across_meal_times;
      });
      setIngredientsSummaryTotalsByUOM(totalsByUOM);
    } else {
      setFlattenedIngredientsSummaryData([]);
      setIngredientsSummaryTotalsByUOM({});
    }
  }, [overallIngredientsData, targetDisplayDuration]);


  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="container mx-auto p-4 md:p-8 space-y-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 mb-6">
            <TabsTrigger value="upload">Upload Excel</TabsTrigger>
            <TabsTrigger value="raw-materials" disabled={!dietData}>Raw Materials Required</TabsTrigger>
            <TabsTrigger value="ingredient-totals" disabled={!dietData}>Ingredient Totals</TabsTrigger>
            <TabsTrigger value="recipes" disabled={!dietData}>Recipes</TabsTrigger>
            <TabsTrigger value="combo-ingredients" disabled={!dietData}>Combo Ingredients</TabsTrigger>
            <TabsTrigger value="choice-ingredients" disabled={!dietData}>Choice Ingredients</TabsTrigger>
            <TabsTrigger value="summary" disabled={!dietData}>Summary</TabsTrigger>
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
              title={formattedOverallIngredientsTitle}
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
                    const allUOMsInGroup = Array.from(new Set(typeGroup.ingredients.map(i => i.base_uom_name))).sort();
                    
                    typeGroup.group_specific_meal_times.forEach(mt => {
                        totalsByMealTimeAndUOM[mt] = {};
                        typeGroup.ingredients.forEach(ing => {
                          const qty = ing.quantities_by_meal_time[mt] || 0;
                          totalsByMealTimeAndUOM[mt][ing.base_uom_name] = (totalsByMealTimeAndUOM[mt][ing.base_uom_name] || 0) + qty;
                        });
                    });
                    
                    return (
                    <Card key={itemKey} className="overflow-hidden shadow-md rounded-lg">
                      <CardHeader className="bg-muted/50 flex flex-row items-center justify-between p-4">
                        <div>
                          <CardTitle className="text-lg font-semibold text-accent">
                            {typeGroup.ingredient_type_name}
                            {selectedTimeSegmentId && timeOfDaySegmentOptions.find(s => s.id === selectedTimeSegmentId && s.id !== 'all_day') ? ` - ${timeOfDaySegmentOptions.find(s => s.id === selectedTimeSegmentId)?.label}` : ''}
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
                                     <span className={`ml-1 ${!expandedSpeciesText[itemKey] && typeGroup.overall_consuming_species_details.length > 10 ? "line-clamp-2" : ""}`}>
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
                            <Table>
                                <TableHeader className="bg-muted/50">
                                    <TableRow>
                                        <TableHead className="font-semibold text-muted-foreground whitespace-nowrap">Ingredients Name</TableHead>
                                        <TableHead className="font-semibold text-muted-foreground whitespace-nowrap">Preparation Types</TableHead>
                                        <TableHead className="font-semibold text-muted-foreground whitespace-nowrap">Cut Sizes</TableHead>
                                        <TableHead className="font-semibold text-muted-foreground whitespace-nowrap">Base UOM</TableHead>
                                        {typeGroup.group_specific_meal_times.map(mealTime => (
                                            <TableHead key={mealTime} className="font-semibold text-muted-foreground whitespace-nowrap">{mealTime}</TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {typeGroup.ingredients.map((ingredient, ingIndex) => (
                                        <TableRow key={ingIndex} className="border-b last:border-b-0 hover:bg-muted/20">
                                            <TableCell className="align-top whitespace-nowrap">{ingredient.ingredient_name}</TableCell>
                                            <TableCell className="align-top whitespace-nowrap">{ingredient.preparation_type_name || 'N/A'}</TableCell>
                                            <TableCell className="align-top whitespace-nowrap">{ingredient.cut_size_name || 'N/A'}</TableCell>
                                            <TableCell className="align-top whitespace-nowrap">{ingredient.base_uom_name}</TableCell>
                                            {typeGroup.group_specific_meal_times.map(mealTime => (
                                                <TableCell key={`${mealTime}-${ingIndex}`} className="align-top whitespace-nowrap">
                                                    {ingredient.quantities_by_meal_time[mealTime]?.toFixed(2) === '0.00' ? '' : ingredient.quantities_by_meal_time[mealTime]?.toFixed(2) || ''}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableBody>
                                 <ShadTableFooter className="bg-muted/50 font-semibold">
                                    {allUOMsInGroup.map(uom => (
                                        <TableRow key={`total-uom-${itemKey}-${uom}`}>
                                            <TableCell className="text-right font-medium text-muted-foreground whitespace-nowrap" colSpan={4}>Total Qty Required ({uom}):</TableCell>
                                            {typeGroup.group_specific_meal_times.map(mealTime => (
                                                <TableCell key={`total-${mealTime}-${uom}`} className="text-left whitespace-nowrap">
                                                    {totalsByMealTimeAndUOM[mealTime]?.[uom]?.toFixed(2) === '0.00' ? '' : totalsByMealTimeAndUOM[mealTime]?.[uom]?.toFixed(2) || ''}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))}
                                    <TableRow>
                                        <TableCell className="font-medium text-muted-foreground whitespace-nowrap text-right" colSpan={4}># of Animals</TableCell>
                                        {typeGroup.group_specific_meal_times.map(mealTime => (
                                            <TableCell key={`animals-${mealTime}`} className="text-left whitespace-nowrap">
                                                <Button variant="link" className="p-0 h-auto text-sm text-primary font-bold" onClick={() => openAnimalListModal(`${typeGroup.ingredient_type_name} - ${mealTime} - Animals`, typeGroup.animals_per_meal_time[mealTime] || [])} disabled={(typeGroup.animals_per_meal_time[mealTime] || []).length === 0}>
                                                    {(typeGroup.animals_per_meal_time[mealTime] || []).length}
                                                </Button>
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                    <TableRow>
                                        <TableCell className="font-medium text-muted-foreground whitespace-nowrap text-right" colSpan={4}># of Species</TableCell>
                                        {typeGroup.group_specific_meal_times.map(mealTime => (
                                            <TableCell key={`species-${mealTime}`} className="text-left whitespace-nowrap">
                                                <Button variant="link" className="p-0 h-auto text-sm text-primary font-bold" onClick={() => openSpeciesListModal(`${typeGroup.ingredient_type_name} - ${mealTime} - Species`, typeGroup.species_details_per_meal_time[mealTime] || [])} disabled={(typeGroup.species_details_per_meal_time[mealTime] || []).length === 0}>
                                                    {(typeGroup.species_details_per_meal_time[mealTime] || []).length}
                                                </Button>
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                    <TableRow>
                                        <TableCell className="font-medium text-muted-foreground whitespace-nowrap text-right" colSpan={4}># of Enclosures</TableCell>
                                        {typeGroup.group_specific_meal_times.map(mealTime => (
                                            <TableCell key={`enclosures-${mealTime}`} className="text-left whitespace-nowrap">
                                                <Button variant="link" className="p-0 h-auto text-sm text-primary font-bold" onClick={() => openEnclosureListModal(`${typeGroup.ingredient_type_name} - ${mealTime} - Enclosures`, typeGroup.enclosures_per_meal_time[mealTime] || [])} disabled={(typeGroup.enclosures_per_meal_time[mealTime] || []).length === 0}>
                                                    {(typeGroup.enclosures_per_meal_time[mealTime] || []).length}
                                                </Button>
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                </ShadTableFooter>
                            </Table>
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
                    const allUOMsInGroup = Array.from(new Set(recipe.ingredients.map(i => i.base_uom_name))).sort();
                    
                    recipe.group_specific_meal_times.forEach(mt => {
                        totalsByMealTimeAndUOM[mt] = {};
                        recipe.ingredients.forEach(ing => {
                          const qty = ing.quantities_by_meal_time[mt] || 0;
                          totalsByMealTimeAndUOM[mt][ing.base_uom_name] = (totalsByMealTimeAndUOM[mt][ing.base_uom_name] || 0) + qty;
                        });
                    });

                    return (
                    <Card key={itemKey} className="overflow-hidden shadow-md rounded-lg">
                      <CardHeader className="bg-muted/50 flex flex-row items-center justify-between p-4">
                        <div>
                          <CardTitle className="text-lg font-semibold text-accent">
                            {recipe.recipe_name}
                            {selectedTimeSegmentId && selectedTimeSegmentId !== 'all_day' && timeOfDaySegmentOptions.find(s => s.id === selectedTimeSegmentId) ? ` - ${timeOfDaySegmentOptions.find(s => s.id === selectedTimeSegmentId)?.label}` : ''}
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
                                     <span className={`ml-1 ${!expandedSpeciesText[itemKey] && recipe.overall_consuming_species_details.length > 10 ? "line-clamp-2" : ""}`}>
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
                           <Table>
                                <TableHeader className="bg-muted/50">
                                    <TableRow>
                                        <TableHead className="font-semibold text-muted-foreground whitespace-nowrap">Ingredients Name</TableHead>
                                        <TableHead className="font-semibold text-muted-foreground whitespace-nowrap">Preparation Types</TableHead>
                                        <TableHead className="font-semibold text-muted-foreground whitespace-nowrap">Cut Sizes</TableHead>
                                        <TableHead className="font-semibold text-muted-foreground whitespace-nowrap">Base UOM</TableHead>
                                        {recipe.group_specific_meal_times.map(mealTime => (
                                            <TableHead key={mealTime} className="font-semibold text-muted-foreground whitespace-nowrap">{mealTime}</TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {recipe.ingredients.map((ingredient, ingIndex) => (
                                        <TableRow key={ingIndex} className="border-b last:border-b-0 hover:bg-muted/20">
                                            <TableCell className="align-top whitespace-nowrap">{ingredient.ingredient_name}</TableCell>
                                            <TableCell className="align-top whitespace-nowrap">{ingredient.preparation_type_name || 'N/A'}</TableCell>
                                            <TableCell className="align-top whitespace-nowrap">{ingredient.cut_size_name || 'N/A'}</TableCell>
                                            <TableCell className="align-top whitespace-nowrap">{ingredient.base_uom_name}</TableCell>
                                            {recipe.group_specific_meal_times.map(mealTime => (
                                                <TableCell key={`${mealTime}-${ingIndex}`} className="align-top whitespace-nowrap">
                                                    {ingredient.quantities_by_meal_time[mealTime]?.toFixed(4) === '0.0000' ? '' : ingredient.quantities_by_meal_time[mealTime]?.toFixed(4) || ''}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableBody>
                                 <ShadTableFooter className="bg-muted/50 font-semibold">
                                    {allUOMsInGroup.map(uom => (
                                        <TableRow key={`total-uom-${itemKey}-${uom}`}>
                                            <TableCell colSpan={4} className="text-right text-muted-foreground">Total Qty Required ({uom}):</TableCell>
                                            {recipe.group_specific_meal_times.map(mealTime => (
                                                <TableCell key={`total-${mealTime}-${uom}`} className="text-left">
                                                    {totalsByMealTimeAndUOM[mealTime]?.[uom]?.toFixed(4) === '0.0000' ? '' : totalsByMealTimeAndUOM[mealTime]?.[uom]?.toFixed(4) || ''}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))}
                                    <TableRow>
                                        <TableCell className="font-medium text-muted-foreground whitespace-nowrap text-right" colSpan={4}># of Animals</TableCell>
                                        {recipe.group_specific_meal_times.map(mealTime => (
                                            <TableCell key={`animals-${mealTime}`} className="text-left whitespace-nowrap">
                                                 <Button variant="link" className="p-0 h-auto text-sm text-primary font-bold" onClick={() => openAnimalListModal(`${recipe.recipe_name} - ${mealTime} - Animals`, recipe.animals_per_meal_time[mealTime] || [])} disabled={(recipe.animals_per_meal_time[mealTime] || []).length === 0}>
                                                    {(recipe.animals_per_meal_time[mealTime] || []).length}
                                                </Button>
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                    <TableRow>
                                        <TableCell className="font-medium text-muted-foreground whitespace-nowrap text-right" colSpan={4}># of Species</TableCell>
                                        {recipe.group_specific_meal_times.map(mealTime => (
                                            <TableCell key={`species-${mealTime}`} className="text-left whitespace-nowrap">
                                                <Button variant="link" className="p-0 h-auto text-sm text-primary font-bold" onClick={() => openSpeciesListModal(`${recipe.recipe_name} - ${mealTime} - Species`, recipe.species_details_per_meal_time[mealTime] || [])} disabled={(recipe.species_details_per_meal_time[mealTime] || []).length === 0}>
                                                    {(recipe.species_details_per_meal_time[mealTime] || []).length}
                                                </Button>
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                    <TableRow>
                                        <TableCell className="font-medium text-muted-foreground whitespace-nowrap text-right" colSpan={4}># of Enclosures</TableCell>
                                        {recipe.group_specific_meal_times.map(mealTime => (
                                            <TableCell key={`enclosures-${mealTime}`} className="text-left whitespace-nowrap">
                                                 <Button variant="link" className="p-0 h-auto text-sm text-primary font-bold" onClick={() => openEnclosureListModal(`${recipe.recipe_name} - ${mealTime} - Enclosures`, recipe.enclosures_per_meal_time[mealTime] || [])} disabled={(recipe.enclosures_per_meal_time[mealTime] || []).length === 0}>
                                                    {(recipe.enclosures_per_meal_time[mealTime] || []).length}
                                                </Button>
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                </ShadTableFooter>
                            </Table>
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
                    const allUOMsInGroup = Array.from(new Set(comboGroup.ingredients.map(i => i.base_uom_name))).sort();
                    
                     comboGroup.group_specific_meal_times.forEach(mt => {
                        totalsByMealTimeAndUOM[mt] = {};
                        comboGroup.ingredients.forEach(ing => {
                           const qty = ing.quantities_by_meal_time[mt] || 0;
                           totalsByMealTimeAndUOM[mt][ing.base_uom_name] = (totalsByMealTimeAndUOM[mt][ing.base_uom_name] || 0) + qty;
                        });
                    });
                    
                    return (
                    <Card key={itemKey} className="overflow-hidden shadow-md rounded-lg">
                      <CardHeader className="bg-muted/50 flex flex-row items-center justify-between p-4">
                        <div>
                          <CardTitle className="text-lg font-semibold text-accent">
                            {comboGroup.combo_group_name}
                            {selectedTimeSegmentId && selectedTimeSegmentId !== 'all_day' && timeOfDaySegmentOptions.find(s => s.id === selectedTimeSegmentId) ? ` - ${timeOfDaySegmentOptions.find(s => s.id === selectedTimeSegmentId)?.label}` : ''}
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
                                      <span className={`ml-1 ${!expandedSpeciesText[itemKey] && comboGroup.overall_consuming_species_details.length > 10 ? "line-clamp-2" : ""}`}>
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
                            <Table>
                                <TableHeader className="bg-muted/50">
                                    <TableRow>
                                        <TableHead className="font-semibold text-muted-foreground whitespace-nowrap">Ingredients Name</TableHead>
                                        <TableHead className="font-semibold text-muted-foreground whitespace-nowrap">Preparation Types</TableHead>
                                        <TableHead className="font-semibold text-muted-foreground whitespace-nowrap">Cut Sizes</TableHead>
                                        <TableHead className="font-semibold text-muted-foreground whitespace-nowrap">Base UOM</TableHead>
                                        {comboGroup.group_specific_meal_times.map(mealTime => (
                                            <TableHead key={mealTime} className="font-semibold text-muted-foreground whitespace-nowrap">{mealTime}</TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {comboGroup.ingredients.map((ingredient, ingIndex) => (
                                        <TableRow key={ingIndex} className="border-b last:border-b-0 hover:bg-muted/20">
                                            <TableCell className="align-top whitespace-nowrap">{ingredient.ingredient_name}</TableCell>
                                            <TableCell className="align-top whitespace-nowrap">{ingredient.preparation_type_name || 'N/A'}</TableCell>
                                            <TableCell className="align-top whitespace-nowrap">{ingredient.cut_size_name || 'N/A'}</TableCell>
                                            <TableCell className="align-top whitespace-nowrap">{ingredient.base_uom_name}</TableCell>
                                            {comboGroup.group_specific_meal_times.map(mealTime => (
                                                <TableCell key={`${mealTime}-${ingIndex}`} className="align-top whitespace-nowrap">
                                                    {ingredient.quantities_by_meal_time[mealTime]?.toFixed(4) === '0.0000' ? '' : ingredient.quantities_by_meal_time[mealTime]?.toFixed(4) || ''}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableBody>
                                <ShadTableFooter className="bg-muted/50 font-semibold">
                                  {allUOMsInGroup.map(uom => (
                                    <TableRow key={`total-uom-${itemKey}-${uom}`}>
                                        <TableCell colSpan={4} className="text-right font-medium text-muted-foreground">Total Qty Required ({uom}):</TableCell>
                                        {comboGroup.group_specific_meal_times.map(mealTime => (
                                            <TableCell key={`total-${mealTime}-${uom}`} className="text-left">
                                                 {totalsByMealTimeAndUOM[mealTime]?.[uom]?.toFixed(4) === '0.0000' ? '' : totalsByMealTimeAndUOM[mealTime]?.[uom]?.toFixed(4) || ''}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                  ))}
                                     <TableRow>
                                        <TableHead className="text-right font-medium text-muted-foreground whitespace-nowrap" colSpan={4}>Time Slot</TableHead>
                                        {comboGroup.group_specific_meal_times.map(mealTime => (
                                            <TableHead key={`header-timeslot-${mealTime}`} className="text-left whitespace-nowrap">{mealTime}</TableHead>
                                        ))}
                                    </TableRow>
                                    <TableRow>
                                        <TableCell className="font-medium text-muted-foreground whitespace-nowrap text-right" colSpan={4}># of Animals</TableCell>
                                        {comboGroup.group_specific_meal_times.map(mealTime => (
                                            <TableCell key={`animals-${mealTime}`} className="text-left whitespace-nowrap">
                                                <Button variant="link" className="p-0 h-auto text-sm text-primary font-bold" onClick={() => openAnimalListModal(`${comboGroup.combo_group_name} - ${mealTime} - Animals`, comboGroup.animals_per_meal_time[mealTime] || [])} disabled={(comboGroup.animals_per_meal_time[mealTime] || []).length === 0}>
                                                    {(comboGroup.animals_per_meal_time[mealTime] || []).length}
                                                </Button>
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                    <TableRow>
                                        <TableCell className="font-medium text-muted-foreground whitespace-nowrap text-right" colSpan={4}># of Species</TableCell>
                                         {comboGroup.group_specific_meal_times.map(mealTime => (
                                            <TableCell key={`species-${mealTime}`} className="text-left whitespace-nowrap">
                                                <Button variant="link" className="p-0 h-auto text-sm text-primary font-bold" onClick={() => openSpeciesListModal(`${comboGroup.combo_group_name} - ${mealTime} - Species`, comboGroup.species_details_per_meal_time[mealTime] || [])} disabled={(comboGroup.species_details_per_meal_time[mealTime] || []).length === 0}>
                                                    {(comboGroup.species_details_per_meal_time[mealTime] || []).length}
                                                </Button>
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                    <TableRow>
                                        <TableCell className="font-medium text-muted-foreground whitespace-nowrap text-right" colSpan={4}># of Enclosures</TableCell>
                                        {comboGroup.group_specific_meal_times.map(mealTime => (
                                            <TableCell key={`enclosures-${mealTime}`} className="text-left whitespace-nowrap">
                                                 <Button variant="link" className="p-0 h-auto text-sm text-primary font-bold" onClick={() => openEnclosureListModal(`${comboGroup.combo_group_name} - ${mealTime} - Enclosures`, comboGroup.enclosures_per_meal_time[mealTime] || [])} disabled={(comboGroup.enclosures_per_meal_time[mealTime] || []).length === 0}>
                                                    {(comboGroup.enclosures_per_meal_time[mealTime] || []).length}
                                                </Button>
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                </ShadTableFooter>
                            </Table>
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
                  {displayableChoices.map((choiceGroup) => {
                    const itemKey = `choice-${choiceGroup.choice_group_name.replace(/\s+/g, '-')}`;
                     const totalsByMealTimeAndUOM: Record<string, Record<string, number>> = {};
                     const allUOMsInGroup = Array.from(new Set(choiceGroup.ingredients.map(i => i.base_uom_name))).sort();
                     
                     choiceGroup.group_specific_meal_times.forEach(mt => {
                        totalsByMealTimeAndUOM[mt] = {};
                        choiceGroup.ingredients.forEach(ing => {
                           const qty = ing.quantities_by_meal_time[mt] || 0;
                           totalsByMealTimeAndUOM[mt][ing.base_uom_name] = (totalsByMealTimeAndUOM[mt][ing.base_uom_name] || 0) + qty;
                        });
                    });

                    return (
                    <Card key={itemKey} className="overflow-hidden shadow-md rounded-lg">
                      <CardHeader className="bg-muted/50 flex flex-row items-center justify-between p-4">
                        <div>
                          <CardTitle className="text-lg font-semibold text-accent">
                            {choiceGroup.choice_group_name}
                             {selectedTimeSegmentId && selectedTimeSegmentId !== 'all_day' && timeOfDaySegmentOptions.find(s => s.id === selectedTimeSegmentId) ? ` - ${timeOfDaySegmentOptions.find(s => s.id === selectedTimeSegmentId)?.label}` : ''}
                          </CardTitle>
                          <CardDescription className="text-sm text-foreground space-y-1 mt-1">
                            <div className="flex flex-row flex-wrap items-baseline">
                              <span className="font-semibold whitespace-nowrap mr-1">Consuming Species:</span>
                                <Button
                                    variant="link"
                                    className="p-0 h-auto text-sm text-primary font-bold"
                                    onClick={() => openSpeciesListModal(`Species consuming ${choiceGroup.choice_group_name}`, choiceGroup.overall_consuming_species_details)}
                                    disabled={choiceGroup.overall_consuming_species_details.length === 0}
                                  >
                                    {choiceGroup.overall_consuming_species_details.length}
                                </Button>
                                {choiceGroup.overall_consuming_species_details.length > 0 && (
                                    <span className={`ml-1 ${!expandedSpeciesText[itemKey] && choiceGroup.overall_consuming_species_details.length > 10 ? "line-clamp-2" : ""}`}>
                                      {formatSpeciesDetails(choiceGroup.overall_consuming_species_details, !expandedSpeciesText[itemKey] ? 10 : undefined)}
                                    </span>
                                )}
                                {choiceGroup.overall_consuming_species_details.length > 10 && (
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
                                  onClick={() => openAnimalListModal(`Animals consuming ${choiceGroup.choice_group_name}`, choiceGroup.overall_consuming_animal_ids)}
                                  disabled={choiceGroup.overall_consuming_animals_count === 0}
                                >
                                  {choiceGroup.overall_consuming_animals_count}
                                </Button>
                            </div>
                            <div>
                              <span className="font-semibold">Consuming Enclosures: </span>
                                <Button
                                  variant="link"
                                  className="p-0 h-auto text-sm text-primary font-bold"
                                  onClick={() => openEnclosureListModal(`Enclosures for ${choiceGroup.choice_group_name}`, choiceGroup.overall_consuming_enclosures)}
                                  disabled={choiceGroup.overall_consuming_enclosures_count === 0}
                                >
                                  {choiceGroup.overall_consuming_enclosures_count}
                                </Button>
                            </div>
                             <div>
                                <span className="font-semibold">Scheduled Meal Times: </span>
                                <div className="inline-flex flex-wrap gap-1 items-center">
                                {choiceGroup.group_specific_meal_times && choiceGroup.group_specific_meal_times.length > 0
                                  ? choiceGroup.group_specific_meal_times.map(time => <Badge key={time} variant="secondary" className="mr-1 mb-1">{time}</Badge>)
                                  : <Badge variant="outline">N/A</Badge>}
                                </div>
                              </div>
                          </CardDescription>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSingleChoicePdfDownload(choiceGroup)}
                          aria-label={`Download PDF for ${choiceGroup.choice_group_name}`}
                          disabled={isProcessingChoice || isLoading || choiceGroup.ingredients.length === 0}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          PDF
                        </Button>
                      </CardHeader>
                      <CardContent className="p-0">
                         <div className="overflow-x-auto rounded-md border">
                            <Table>
                                <TableHeader className="bg-muted/50">
                                    <TableRow>
                                        <TableHead className="font-semibold text-muted-foreground whitespace-nowrap">Ingredients Name</TableHead>
                                        <TableHead className="font-semibold text-muted-foreground whitespace-nowrap">Preparation Types</TableHead>
                                        <TableHead className="font-semibold text-muted-foreground whitespace-nowrap">Cut Sizes</TableHead>
                                        <TableHead className="font-semibold text-muted-foreground whitespace-nowrap">Base UOM</TableHead>
                                        {choiceGroup.group_specific_meal_times.map(mealTime => (
                                            <TableHead key={mealTime} className="font-semibold text-muted-foreground whitespace-nowrap">{mealTime}</TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {choiceGroup.ingredients.map((ingredient, ingIndex) => (
                                        <TableRow key={ingIndex} className="border-b last:border-b-0 hover:bg-muted/20">
                                            <TableCell className="align-top whitespace-nowrap">{ingredient.ingredient_name}</TableCell>
                                            <TableCell className="align-top whitespace-nowrap">{ingredient.preparation_type_name || 'N/A'}</TableCell>
                                            <TableCell className="align-top whitespace-nowrap">{ingredient.cut_size_name || 'N/A'}</TableCell>
                                            <TableCell className="align-top whitespace-nowrap">{ingredient.base_uom_name}</TableCell>
                                            {choiceGroup.group_specific_meal_times.map(mealTime => (
                                                <TableCell key={`${mealTime}-${ingIndex}`} className="align-top whitespace-nowrap">
                                                    {ingredient.quantities_by_meal_time[mealTime]?.toFixed(4) === '0.0000' ? '' : ingredient.quantities_by_meal_time[mealTime]?.toFixed(4) || ''}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableBody>
                                 <ShadTableFooter className="bg-muted/50 font-semibold">
                                     {allUOMsInGroup.map(uom => (
                                      <TableRow key={`total-uom-${itemKey}-${uom}`}>
                                          <TableCell colSpan={4} className="text-right font-medium text-muted-foreground">Total Qty Required ({uom}):</TableCell>
                                          {choiceGroup.group_specific_meal_times.map(mealTime => (
                                              <TableCell key={`total-${mealTime}-${uom}`} className="text-left">
                                                  {totalsByMealTimeAndUOM[mealTime]?.[uom]?.toFixed(4) === '0.0000' ? '' : totalsByMealTimeAndUOM[mealTime]?.[uom]?.toFixed(4) || ''}
                                              </TableCell>
                                          ))}
                                      </TableRow>
                                    ))}
                                      <TableRow>
                                        <TableHead className="text-right font-medium text-muted-foreground whitespace-nowrap" colSpan={4}>Time Slot</TableHead>
                                        {choiceGroup.group_specific_meal_times.map(mealTime => (
                                            <TableHead key={`header-timeslot-${mealTime}`} className="text-left whitespace-nowrap">{mealTime}</TableHead>
                                        ))}
                                    </TableRow>
                                    <TableRow>
                                        <TableCell className="font-medium text-muted-foreground whitespace-nowrap text-right" colSpan={4}># of Animals</TableCell>
                                        {choiceGroup.group_specific_meal_times.map(mealTime => (
                                            <TableCell key={`animals-${mealTime}`} className="text-left whitespace-nowrap">
                                                <Button variant="link" className="p-0 h-auto text-sm text-primary font-bold" onClick={() => openAnimalListModal(`${choiceGroup.choice_group_name} - ${mealTime} - Animals`, choiceGroup.animals_per_meal_time[mealTime] || [])} disabled={(choiceGroup.animals_per_meal_time[mealTime] || []).length === 0}>
                                                    {(choiceGroup.animals_per_meal_time[mealTime] || []).length}
                                                </Button>
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                    <TableRow>
                                        <TableCell className="font-medium text-muted-foreground whitespace-nowrap text-right" colSpan={4}># of Species</TableCell>
                                        {choiceGroup.group_specific_meal_times.map(mealTime => (
                                            <TableCell key={`species-${mealTime}`} className="text-left whitespace-nowrap">
                                                <Button variant="link" className="p-0 h-auto text-sm text-primary font-bold" onClick={() => openSpeciesListModal(`${choiceGroup.choice_group_name} - ${mealTime} - Species`, choiceGroup.species_details_per_meal_time[mealTime] || [])} disabled={(choiceGroup.species_details_per_meal_time[mealTime] || []).length === 0}>
                                                    {(choiceGroup.species_details_per_meal_time[mealTime] || []).length}
                                                </Button>
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                    <TableRow>
                                        <TableCell className="font-medium text-muted-foreground whitespace-nowrap text-right" colSpan={4}># of Enclosures</TableCell>
                                        {choiceGroup.group_specific_meal_times.map(mealTime => (
                                            <TableCell key={`enclosures-${mealTime}`} className="text-left whitespace-nowrap">
                                                 <Button variant="link" className="p-0 h-auto text-sm text-primary font-bold" onClick={() => openEnclosureListModal(`${choiceGroup.choice_group_name} - ${mealTime} - Enclosures`, choiceGroup.enclosures_per_meal_time[mealTime] || [])} disabled={(choiceGroup.enclosures_per_meal_time[mealTime] || []).length === 0}>
                                                    {(choiceGroup.enclosures_per_meal_time[mealTime] || []).length}
                                                </Button>
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                </ShadTableFooter>
                            </Table>
                        </div>
                        {choiceGroup.ingredients.length === 0 && <p className="text-muted-foreground p-4 text-center">No ingredients for this choice group.</p>}
                      </CardContent>
                    </Card>
                  )})}
                </div>
              )}
            </SectionCard>
          </TabsContent>

          <TabsContent value="summary" className="space-y-6">
            {renderFilterAndSummaryCards(null, isLoading || isProcessingOverall || isProcessingDetailedRaw || isProcessingRecipes || isProcessingCombo || isProcessingChoice)}
            <Card className="shadow-md">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center">
                  <CardTitle className="text-xl text-primary">Summary</CardTitle>
                </div>
                 <div className="flex items-center gap-2">
                    <Button 
                        onClick={() => setShowSummary(prev => !prev)}
                        disabled={!dietData || isLoading || isProcessingOverall || isProcessingDetailedRaw || isProcessingRecipes || isProcessingCombo || isProcessingChoice }
                      >
                        {showSummary ? "Hide Summary" : "Generate Summary"}
                    </Button>
                    <Button
                        onClick={handleSummaryPdfDownload}
                        variant="outline"
                        size="sm"
                        disabled={!showSummary || !dietData || isLoading || isProcessingOverall || isProcessingDetailedRaw || isProcessingRecipes || isProcessingCombo || isProcessingChoice}
                        aria-label="Download Summary PDF"
                    >
                        <Download className="mr-2 h-4 w-4" /> PDF
                    </Button>
                </div>
              </CardHeader>
              <CardContent>
                {!dietData ? (
                  <Alert>
                    <Utensils className="h-4 w-4" />
                    <AlertTitle>No Data Loaded</AlertTitle>
                    <AlertDescription>
                      Please upload an Excel file on the "Upload Excel" tab to generate a summary.
                    </AlertDescription>
                  </Alert>
                ) : !showSummary ? (
                   <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>Summary Not Generated</AlertTitle>
                    <AlertDescription>
                      Click the "Generate Summary" button to view the diet plan summary based on current filters.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Ingredients Summary</CardTitle>
                        <CardDescription>
                          Total unique ingredients listed: {flattenedIngredientsSummaryData.length}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {flattenedIngredientsSummaryData.length > 0 ? (
                           <ScrollArea className="h-[300px] w-full rounded-md border">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  {columnsForIngredientsSummary.map(col => <TableHead key={col.key as string}>{col.header}</TableHead>)}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {flattenedIngredientsSummaryData.map((item, idx) => (
                                  <TableRow key={idx}>
                                    {columnsForIngredientsSummary.map(col => (
                                      <TableCell key={col.key as string}>
                                        {col.cell ? col.cell(item) : (item as any)[col.key]}
                                      </TableCell>
                                    ))}
                                  </TableRow>
                                ))}
                              </TableBody>
                              <ShadTableFooter className="bg-muted/50 font-semibold">
                                  {Object.entries(ingredientsSummaryTotalsByUOM).map(([uom, total]) => (
                                    <TableRow key={`summary-total-${uom}`}>
                                      <TableCell colSpan={columnsForIngredientsSummary.findIndex(c => c.key === 'total_qty_for_target_duration_across_meal_times')} className="text-right font-medium text-muted-foreground">
                                        Total Qty Required ({uom}):
                                      </TableCell>
                                      <TableCell className="text-left">
                                        {Number(total).toFixed(2)}
                                      </TableCell>
                                      <TableCell colSpan={columnsForIngredientsSummary.length - 1 - columnsForIngredientsSummary.findIndex(c => c.key === 'total_qty_for_target_duration_across_meal_times')}></TableCell>
                                    </TableRow>
                                  ))}
                                </ShadTableFooter>
                            </Table>
                          </ScrollArea>
                        ) : (
                          <p className="text-muted-foreground">No ingredient data to summarize.</p>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Recipes Summary</CardTitle>
                        <CardDescription>
                          Total recipes: {recipesData?.data?.length || 0}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {recipesData?.data && recipesData.data.length > 0 ? (
                          <ScrollArea className="h-[300px] w-full rounded-md border">
                             <Table>
                                <TableHeader>
                                  <TableRow>
                                    {summaryRecipesColumns.map(col => <TableHead key={col.key as string}>{col.header}</TableHead>)}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {recipesData.data.map((item, idx) => (
                                    <TableRow key={idx}>
                                      {summaryRecipesColumns.map(col => (
                                        <TableCell key={col.key as string}>
                                          {col.cell ? col.cell(item) : (item as any)[col.key]}
                                        </TableCell>
                                      ))}
                                    </TableRow>
                                  ))}
                                </TableBody>
                                 <ShadTableFooter className="bg-muted/50 font-semibold">
                                   {Object.entries(
                                      (recipesData?.data || []).reduce((acc, recipe) => {
                                        recipe.ingredients.forEach(ing => {
                                          acc[ing.base_uom_name] = (acc[ing.base_uom_name] || 0) + ing.total_qty_for_target_duration_across_meal_times;
                                        });
                                        return acc;
                                      }, {} as Record<string, number>)
                                    ).map(([uom, total]) => (
                                      <TableRow key={`recipe-summary-total-${uom}`}>
                                        <TableCell colSpan={summaryRecipesColumns.length - 2} className="text-right font-medium text-muted-foreground">
                                          Total Qty Required ({uom}):
                                        </TableCell>
                                        <TableCell className="text-left">{Number(total).toFixed(4)}</TableCell>
                                        <TableCell/>
                                      </TableRow>
                                    ))}
                                </ShadTableFooter>
                              </Table>
                          </ScrollArea>
                        ) : (
                          <p className="text-muted-foreground">No recipe data to summarize.</p>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Combo Ingredients Summary</CardTitle>
                        <CardDescription>
                          Total combo groups: {comboIngredientsData?.data?.length || 0}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {comboIngredientsData?.data && comboIngredientsData.data.length > 0 ? (
                          <ScrollArea className="h-[300px] w-full rounded-md border">
                            <Table>
                                <TableHeader>
                                  <TableRow>
                                    {summaryCombosColumns.map(col => <TableHead key={col.key as string}>{col.header}</TableHead>)}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {comboIngredientsData.data.map((item, idx) => (
                                    <TableRow key={idx}>
                                      {summaryCombosColumns.map(col => (
                                        <TableCell key={col.key as string}>
                                          {col.cell ? col.cell(item) : (item as any)[col.key]}
                                        </TableCell>
                                      ))}
                                    </TableRow>
                                  ))}
                                </TableBody>
                                <ShadTableFooter className="bg-muted/50 font-semibold">
                                   {Object.entries(
                                      (comboIngredientsData?.data || []).reduce((acc, group) => {
                                        group.ingredients.forEach(ing => {
                                          acc[ing.base_uom_name] = (acc[ing.base_uom_name] || 0) + ing.total_qty_for_target_duration_across_meal_times;
                                        });
                                        return acc;
                                      }, {} as Record<string, number>)
                                    ).map(([uom, total]) => (
                                      <TableRow key={`combo-summary-total-${uom}`}>
                                        <TableCell colSpan={summaryCombosColumns.length - 2} className="text-right font-medium text-muted-foreground">
                                          Total Qty Required ({uom}):
                                        </TableCell>
                                        <TableCell className="text-left">{Number(total).toFixed(4)}</TableCell>
                                        <TableCell/>
                                      </TableRow>
                                    ))}
                                </ShadTableFooter>
                              </Table>
                          </ScrollArea>
                        ) : (
                          <p className="text-muted-foreground">No combo ingredient data to summarize.</p>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Choice Ingredients Summary</CardTitle>
                        <CardDescription>
                          Total choice groups: {choiceIngredientsData?.data?.length || 0}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {choiceIngredientsData?.data && choiceIngredientsData.data.length > 0 ? (
                          <ScrollArea className="h-[300px] w-full rounded-md border">
                             <Table>
                                <TableHeader>
                                  <TableRow>
                                    {summaryChoicesColumns.map(col => <TableHead key={col.key as string}>{col.header}</TableHead>)}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {choiceIngredientsData.data.map((item, idx) => (
                                    <TableRow key={idx}>
                                      {summaryChoicesColumns.map(col => (
                                        <TableCell key={col.key as string}>
                                          {col.cell ? col.cell(item) : (item as any)[col.key]}
                                        </TableCell>
                                      ))}
                                    </TableRow>
                                  ))}
                                </TableBody>
                                <ShadTableFooter className="bg-muted/50 font-semibold">
                                   {Object.entries(
                                      (choiceIngredientsData?.data || []).reduce((acc, group) => {
                                        group.ingredients.forEach(ing => {
                                          acc[ing.base_uom_name] = (acc[ing.base_uom_name] || 0) + ing.total_qty_for_target_duration_across_meal_times;
                                        });
                                        return acc;
                                      }, {} as Record<string, number>)
                                    ).map(([uom, total]) => (
                                      <TableRow key={`choice-summary-total-${uom}`}>
                                        <TableCell colSpan={summaryChoicesColumns.length -2} className="text-right font-medium text-muted-foreground">
                                          Total Qty Required ({uom}):
                                        </TableCell>
                                        <TableCell className="text-left">{Number(total).toFixed(4)}</TableCell>
                                        <TableCell/>
                                      </TableRow>
                                    ))}
                                </ShadTableFooter>
                              </Table>
                          </ScrollArea>
                        ) : (
                          <p className="text-muted-foreground">No choice ingredient data to summarize.</p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          

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

        <Dialog open={isIngredientListModalOpen} onOpenChange={setIsIngredientListModalOpen}>
          <DialogContent className="sm:max-w-md md:max-w-lg">
            <DialogHeader>
              <DialogTitle>{ingredientListModalTitle}</DialogTitle>
              <DialogDescription>
                List of ingredients.
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="h-[300px] w-full rounded-md border p-4 my-4">
              {ingredientListForModal.length > 0 ? (
                ingredientListForModal.map((name, idx) => (
                  <div key={idx} className="py-1 text-sm border-b last:border-b-0">
                    {name}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No ingredients to display.</p>
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
    
    
