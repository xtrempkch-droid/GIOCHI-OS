#!/usr/bin/env node
// Roda todos os testes em um único processo.
//
// `node --test tests/` spawna um processo por arquivo e, sob o sandbox de
// arquivos, falha com `spawn EPERM`.
import "./pipeline.test.mjs";
