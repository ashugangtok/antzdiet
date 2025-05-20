
'use server';
/**
 * @fileOverview A Genkit flow to summarize diet plan data.
 *
 * - summarizeDiet - A function that generates a summary of the diet plan.
 * - SummarizeDietInput - The input type for the summarizeDiet function.
 * - SummarizeDietOutput - The return type for the summarizeDiet function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const IngredientDetailSchema = z.object({
  ingredient_name: z.string().describe('The name of the ingredient.'),
  qty: z.number().describe('The quantity of the ingredient.'),
  uom: z.string().describe('The unit of measure for the ingredient quantity.'),
});

const RecipeDetailSchema = z.object({
  recipe_name: z.string().describe('The name of the recipe.'),
  total_qty: z.number().describe('The total quantity of the recipe prepared.'),
  uom: z.string().describe('The unit of measure for the recipe quantity.'),
  consuming_species_count: z.number().describe('Number of unique species consuming this recipe.'),
  consuming_animals_count: z.number().describe('Number of unique animals consuming this recipe.'),
});

const SummarizeDietInputSchema = z.object({
  overallIngredients: z.array(IngredientDetailSchema).describe('A list of overall ingredients and their quantities.'),
  recipes: z.array(RecipeDetailSchema).describe('A list of recipes, their total quantities, and consumer counts.'),
  targetDisplayDuration: z.number().describe('The number of days the current data view represents (e.g., 1, 7, 15, 30).'),
  totalAnimals: z.number().describe('The total number of unique animals covered by the current filters.'),
  totalSpecies: z.number().describe('The total number of unique species covered by the current filters.'),
  dateRange: z.string().describe('The date range of the provided Excel data (e.g., "Jan 1, 2024 - Jan 7, 2024" or "N/A").'),
});
export type SummarizeDietInput = z.infer<typeof SummarizeDietInputSchema>;

const SummarizeDietOutputSchema = z.object({
  summaryText: z.string().describe('A concise summary of the diet plan.'),
});
export type SummarizeDietOutput = z.infer<typeof SummarizeDietOutputSchema>;

export async function summarizeDiet(input: SummarizeDietInput): Promise<SummarizeDietOutput> {
  return summarizeDietFlow(input);
}

const prompt = ai.definePrompt({
  name: 'summarizeDietPrompt',
  input: { schema: SummarizeDietInputSchema },
  output: { schema: SummarizeDietOutputSchema },
  prompt: `
    You are an expert diet analyst for zoos and animal care facilities.
    Your task is to generate a concise and insightful summary of an animal diet plan based on the provided data.

    The data covers a period of {{targetDisplayDuration}} day(s).
    The Excel data itself spans the date range: {{dateRange}}.
    The current filtered view includes {{totalAnimals}} animals across {{totalSpecies}} species.

    Key Overall Ingredients (for {{targetDisplayDuration}} days):
    {{#if overallIngredients.length}}
      {{#each overallIngredients}}
      - {{ingredient_name}}: {{qty}} {{uom}}
      {{/each}}
    {{else}}
      No specific overall ingredient data provided for this summary.
    {{/if}}

    Key Recipes (totals for {{targetDisplayDuration}} days):
    {{#if recipes.length}}
      {{#each recipes}}
      - {{recipe_name}}: {{total_qty}} {{uom}} (Consumed by {{consuming_animals_count}} animals across {{consuming_species_count}} species)
      {{/each}}
    {{else}}
      No specific recipe data provided for this summary.
    {{/if}}

    Based on this information, provide a summary. Highlight:
    1. The most significant overall ingredients by quantity.
    2. Notable recipes, considering their total quantity and the number of animals/species consuming them.
    3. Any interesting observations or potential areas of focus based on the provided data points (e.g., high consumption of a particular item, a recipe popular across many species).
    4. Keep the summary to a few paragraphs. Be informative and easy to understand.
    
    Begin your summary with "Diet Plan Analysis for {{targetDisplayDuration}} Day(s):".
  `,
});

const summarizeDietFlow = ai.defineFlow(
  {
    name: 'summarizeDietFlow',
    inputSchema: SummarizeDietInputSchema,
    outputSchema: SummarizeDietOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) {
      throw new Error('No output from AI prompt');
    }
    return output;
  }
);
