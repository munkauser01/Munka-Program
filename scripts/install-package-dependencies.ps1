param([string]$StorePath)
$installArguments = @('install','--prod','--frozen-lockfile','--ignore-scripts','--config.node-linker=hoisted')
if ($env:MUNKA_ALLOW_ONLINE_INSTALL -ne 'true') { $installArguments += '--offline' }
if ($StorePath) { $installArguments += @('--store-dir', $StorePath) }
& pnpm @installArguments
exit $LASTEXITCODE
