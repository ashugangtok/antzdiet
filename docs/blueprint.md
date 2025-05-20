# **App Name**: Diet Insights

## Core Features:

- File Upload: Enable users to upload .xlsx files containing animal diet plans. The app will validate the file to make sure that required columns are present: `site_name`, `ingredient_name`, `type`, `ingredient_qty`, `animal_id`, `scientific_name`, etc.
- Total Ingredients Required Site-Wise: Display a table summarizing the total quantity of each ingredient required at each site. Data will be grouped by `site_name`, `ingredient_name`, and `base_uom_name`, and `ingredient_qty` will be summed.
- Total Ingredient Usage: Display a table summarizing the total usage of each ingredient, along with the number of animals and species that consume it.  Group by `ingredient_name` and `base_uom_name`, and showing the sum of `ingredient_qty` as `total_used_qty`, a count of unique `animal_id` as `total_animals`, and a count of unique `scientific_name` as `total_species`.
- Total Combo Ingredient Usage: Display a table that exclusively displays the combo ingredient usage. This will show the total usage of ingredients of type 'combo', grouping by `ingredient_name`, `type_name`, and `base_uom_name`, showing the sum of `ingredient_qty` as `total_used_qty`, a count of unique `animal_id` as `total_animals`, and a count of unique `scientific_name` as `total_species`.
- Download PDF Reports: Provide options to download each table view as a PDF document.

## Style Guidelines:

- The primary color will be a desaturated blue (#73A5B3), to evoke a feeling of calm analysis. This hue avoids being obtrusive while aligning with a sense of ecological awareness.
- The background color will be a light gray (#F0F4F5), providing a clean and neutral backdrop to ensure that data is legible. It evokes cleanliness and facilitates prolonged screen viewing.
- An accent color of muted teal (#5E8B7E) will be used sparingly for interactive elements and key highlights. Its unique tone will help these elements stand out without disrupting the overall aesthetic.
- Clean, sans-serif fonts such as Open Sans will be used to maintain excellent readability across all data displays.
- Use a consistent style of minimalist icons, for example the Remix Icon set, throughout the application.
- A card-based layout will present each data view, ensuring content is visually separated and easily digestible.
- Subtle transitions will be used to provide feedback upon actions, like file uploads and PDF downloads. Loading states are indicated with animated progress bars.