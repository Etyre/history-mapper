# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

History-mapper is a web application for creating timeline visualizations of sequential historical events. It combines a directed-graph visualization (spans on a timeline with causal arrows) with a spreadsheet-like data entry interface.

## Architecture (from spec)

The app has two main parts displayed side-by-side:

1. **Visualization**: A directed graph on a vertical year-based timeline. Rectangular "span" blocks represent events/periods, with height corresponding to duration. Arrows between spans represent causal connections. Uses force-directed horizontal layout. Built with HTML/JS and must be exportable as a standalone webpage.

2. **Data entry interface**: Spreadsheet-like UI for editing spans (title, start/end year, type, sub-events, causal impacts). Supports JSON import/export.

## Data Model

- **Spans**: title, start year, end year (or "ongoing"), span-type (Economics/Technology/Politics/Culture/Subculture), optional sub-events (date + label), optional causal impacts
- **Causal impacts** (arrows): target span, source attachment point (middle/end), target attachment point (start/middle), annotation text

## Key Constraints

- All code lives in the `history-mapper` folder
- Visualization must be exportable as a static webpage for embedding on a personal site
- Span colors correspond to span-type categories
- Arrow annotations and sub-event labels appear on hover

## Workflow

- **Commit and push after every change**: After every new feature, bug fix, or edit to span data, commit and push to git.
