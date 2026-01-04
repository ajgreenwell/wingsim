#!/usr/bin/env node

import { Command } from "commander";

const program = new Command();

program
  .name("wingsim")
  .description("CLI simulator for Wingspan board game playthroughs")
  .version("0.1.0");

program
  .command("simulate")
  .description("Run a Wingspan game simulation")
  .option("-p, --players <number>", "Number of players", "2")
  .action((options) => {
    console.log(`Starting Wingspan simulation with ${options.players} players...`);
    console.log("(Simulation not yet implemented)");
  });

program.parse();
