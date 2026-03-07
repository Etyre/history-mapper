## Spec for history-mapper

History-mapper is software that will allow me to easily create a visualization of sequential events.

Everything should be built in the history-mapper folder

## Visualization

The visualization is a directed graph that is situated on a timeline of years.

The elements of the graph should be rectangles representing events or spans of time. 

The height of each span corresponds to a length in years: the bottom of the rectangle should be aligned the start year, and the top of the rectangle should be aligned with the end year.

There’s the ability to annotate blocks with specific atomic events that have specific dates. These should be represented as small tick marks on the block. The labels for all the events appear when you hover over the block.

Each span rectangle can be one of several colors, each representing 

- Economics
- Technology
- Politics
- Culture
- Subculture

Arrows can be drawn from the end or the middle of an event to the beginning or the middle of another event. This represents one event causing or contributing to another. Each of these arrows can be annotated: when you hover over the line, that reveals a textbox that explains the causal connection. That textbox should allow hyperlinks.

The spans should be spaced horizontally using a simple forced directed layout.

This visualization should be written in web languages (eg HTML and Javascript). The visualization should be exportable as a webpage that I can put on my personal website.


## Backend

The user should be able to enter and edit data to be visualized via a spreadsheet like interface. 

The basic view should have the visualization on one side and the data entry interface on the other.

Each span-block includes the following data:

-   Title
-   Start year
-   End year (including an "ongoing" option)
-   Span-type (which should be a drop down of options)
-   [optional] A list of sub events.
    -   Each sub event is a tuple of 
		- the date of the event 
		- 	The label of the event
-   [optional] A list of causal impacts (which will be represented as arrows on the graph)
    -   Each causal impact is is represented by...
       - Target: the span the arrow is pointing too (selected from dropdown)
		- Target attachment point (start/middle of target span)
		- Source attachment point (middle/end of source span)
		- The annotation text of the arrow.
       -   The annotation text of the arrow.


Spans can be added in any order, but there should also be a button to reorder the rows by chronological start date.

All of the data should be exportable as a JSON file, and the app can symmetrically load from a JSON file.