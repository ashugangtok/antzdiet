import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SearchableFilter } from './SearchableFilter';
import { TimeFilter } from './TimeFilter';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

interface FilterSectionProps {
  siteNames: string[];
  selectedSites: string[];
  onSiteChange: (values: string[]) => void;
  sectionNames: string[];
  selectedSections: string[];
  onSectionChange: (values: string[]) => void;
  enclosureNames: string[];
  selectedEnclosures: string[];
  onEnclosureChange: (values: string[]) => void;
  classNames: string[];
  selectedClasses: string[];
  onClassChange: (values: string[]) => void;
  speciesNames: string[];
  selectedSpecies: string[];
  onSpeciesChange: (values: string[]) => void;
  timeRange: string;
  onTimeRangeChange: (value: string) => void;
}

export function FilterSection({
  siteNames,
  selectedSites,
  onSiteChange,
  sectionNames,
  selectedSections,
  onSectionChange,
  enclosureNames,
  selectedEnclosures,
  onEnclosureChange,
  classNames,
  selectedClasses,
  onClassChange,
  speciesNames,
  selectedSpecies,
  onSpeciesChange,
  timeRange,
  onTimeRangeChange,
}: FilterSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Filters</CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="space-y-4">
          <AccordionItem value="time">
            <AccordionTrigger>Time Range</AccordionTrigger>
            <AccordionContent>
              <TimeFilter value={timeRange} onChange={onTimeRangeChange} />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="sites">
            <AccordionTrigger>Sites</AccordionTrigger>
            <AccordionContent>
              <SearchableFilter
                options={siteNames}
                selectedValues={selectedSites}
                onSelectionChange={onSiteChange}
                placeholder="Search sites..."
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="sections">
            <AccordionTrigger>Sections</AccordionTrigger>
            <AccordionContent>
              <SearchableFilter
                options={sectionNames}
                selectedValues={selectedSections}
                onSelectionChange={onSectionChange}
                placeholder="Search sections..."
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="enclosures">
            <AccordionTrigger>Enclosures</AccordionTrigger>
            <AccordionContent>
              <SearchableFilter
                options={enclosureNames}
                selectedValues={selectedEnclosures}
                onSelectionChange={onEnclosureChange}
                placeholder="Search enclosures..."
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="classes">
            <AccordionTrigger>Classes</AccordionTrigger>
            <AccordionContent>
              <SearchableFilter
                options={classNames}
                selectedValues={selectedClasses}
                onSelectionChange={onClassChange}
                placeholder="Search classes..."
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="species">
            <AccordionTrigger>Species</AccordionTrigger>
            <AccordionContent>
              <SearchableFilter
                options={speciesNames}
                selectedValues={selectedSpecies}
                onSelectionChange={onSpeciesChange}
                placeholder="Search species..."
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}