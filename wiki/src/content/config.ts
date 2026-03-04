import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';

const characters = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "../data/characters" })
});

const rules = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "../data/rules" })
});

const editions = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "../data/editions" })
});

export const collections = {
  characters,
  rules,
  editions
};
