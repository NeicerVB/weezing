param(
    [string]$Profile = 'manta',
    [string]$Region = 'us-east-1',
    [string]$StackName = 'manta-outbreak-lab'
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $projectRoot
try {
    aws sts get-caller-identity --profile $Profile --region $Region --output json
    if ($LASTEXITCODE -ne 0) { throw 'Primero inicia sesión con aws login --profile manta.' }
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'Falló npm ci.' }
    npm test
    if ($LASTEXITCODE -ne 0) { throw 'Fallaron las pruebas.' }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Falló el build.' }
    aws cloudformation validate-template --template-body file://infra/template.yaml --profile $Profile --region $Region
    if ($LASTEXITCODE -ne 0) { throw 'Plantilla inválida o permisos insuficientes.' }
    aws cloudformation deploy --template-file infra/template.yaml --stack-name $StackName --profile $Profile --region $Region --no-fail-on-empty-changeset
    if ($LASTEXITCODE -ne 0) { throw 'Falló CloudFormation; revisa los eventos de la pila.' }
    $rawOutputs = aws cloudformation describe-stacks --stack-name $StackName --query 'Stacks[0].Outputs' --profile $Profile --region $Region --output json
    if ($LASTEXITCODE -ne 0) { throw 'No se pudieron leer las salidas.' }
    $stackOutputs = $rawOutputs | ConvertFrom-Json
    $siteBucket = ($stackOutputs | Where-Object OutputKey -eq 'BucketName').OutputValue
    $distributionId = ($stackOutputs | Where-Object OutputKey -eq 'DistributionId').OutputValue
    $siteUrl = ($stackOutputs | Where-Object OutputKey -eq 'PublicUrl').OutputValue
    aws s3 sync dist/ "s3://$siteBucket/" --exclude index.html --cache-control 'public,max-age=86400' --profile $Profile --region $Region
    if ($LASTEXITCODE -ne 0) { throw 'Falló la subida de assets.' }
    aws s3 cp dist/index.html "s3://$siteBucket/index.html" --content-type text/html --cache-control 'no-cache' --profile $Profile --region $Region
    if ($LASTEXITCODE -ne 0) { throw 'Falló la subida del HTML.' }
    aws cloudfront create-invalidation --distribution-id $distributionId --paths '/*' --profile $Profile --region $Region
    if ($LASTEXITCODE -ne 0) { throw 'Falló la invalidación.' }
    Write-Host "URL pública: $siteUrl"
    Write-Host 'Verifica la URL tras finalizar la propagación de CloudFront y actualiza README.md.'
} finally { Pop-Location }
