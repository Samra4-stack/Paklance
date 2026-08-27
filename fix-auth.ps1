$path = "c:\Users\syeda\Downloads\paklance_backend_updated\index.html"
$backup = "c:\Users\syeda\Downloads\paklance_backend_updated\index_backup.html"
Copy-Item $path $backup -Force
Write-Host "Backup saved: $backup"

$lines = Get-Content -Path $path -Encoding UTF8
$newLines = New-Object System.Collections.Generic.List[string]

foreach ($line in $lines) {
    if ($line -match "^function resetAuthModal\(\)") {
        $newLines.Add("function resetAuthModal(){showLoginTab();const e=`$('#authEmail'),p=`$('#authPassword');if(e)e.value='';if(p)p.value='';hideAuthError()}")
    }
    elseif ($line -match "^function showEmailAuthSection\(\)") { continue }
    elseif ($line -match "^function showLoginTab\(\)") {
        $newLines.Add("function showLoginTab(){`$('#authTabLogin')?.classList.add('active');`$('#authTabSignup')?.classList.remove('active');`$('#authRoleWrap').style.display='none';`$('#authSubmitBtn').textContent='Log in'}")
    }
    elseif ($line -match "^function showSignupTab\(\)") {
        $newLines.Add("function showSignupTab(){`$('#authTabSignup')?.classList.add('active');`$('#authTabLogin')?.classList.remove('active');`$('#authRoleWrap').style.display='flex';`$('#authSubmitBtn').textContent='Sign up'}")
    }
    elseif ($line -match "^function isValidEmail\(") { continue }
    elseif ($line -match "^function setEmailLoginLoading\(") { continue }
    elseif ($line -match "^function mockEmailAuthRequest\(") { continue }
    elseif ($line -match "^async function handleEmailLogin\(") { continue }
    elseif ($line -match "^function showSignupError\(") { continue }
    elseif ($line -match "^function hideSignupError\(") { continue }
    elseif ($line -match "^function isValidPassword\(") { continue }
    elseif ($line -match "^function setSignupLoading\(") { continue }
    elseif ($line -match "^function mockEmailSignupRequest\(") { continue }
    elseif ($line -match "^async function handleSignup\(") { continue }
    elseif ($line -match "continueEmailBtn") {
        $old = "`$('#continueEmailBtn').onclick=showEmailAuthSection;`$('#backToMobileBtn').onclick=resetAuthModal;`$('#emailLoginBtn').onclick=handleEmailLogin;`$('#authPassword').addEventListener('keydown',e=>{if(e.key==='Enter')handleEmailLogin()});`$('#authEmail').addEventListener('keydown',e=>{if(e.key==='Enter')`$('#authPassword').focus()});`$('#authEmail').addEventListener('input',hideAuthError);`$('#authPassword').addEventListener('input',hideAuthError);`$('#authTabLogin').onclick=showLoginTab;`$('#authTabSignup').onclick=showSignupTab;`$('#signupSubmitBtn').onclick=handleSignup;`$('#signupName').addEventListener('keydown',e=>{if(e.key==='Enter')`$('#signupEmail').focus()});`$('#signupEmail').addEventListener('keydown',e=>{if(e.key==='Enter')`$('#signupPassword').focus()});`$('#signupPassword').addEventListener('keydown',e=>{if(e.key==='Enter')`$('#signupConfirmPassword').focus()});`$('#signupConfirmPassword').addEventListener('keydown',e=>{if(e.key==='Enter')handleSignup()});['signupName','signupEmail','signupPassword','signupConfirmPassword'].forEach(id=>`$('#'+id).addEventListener('input',hideSignupError));"
        $new = "`$('#authPassword').addEventListener('keydown',e=>{if(e.key==='Enter')`$('#authSubmitBtn').click()});`$('#authEmail').addEventListener('keydown',e=>{if(e.key==='Enter')`$('#authPassword').focus()});`$('#authEmail').addEventListener('input',hideAuthError);`$('#authPassword').addEventListener('input',hideAuthError);"
        if ($line.Contains($old)) {
            $newLines.Add($line.Replace($old, $new))
            Write-Host "Fixed init() dead chain successfully"
        } else {
            $newLines.Add($line)
            Write-Host "WARNING: exact text not found - this line left UNCHANGED, manual check needed"
        }
    }
    else {
        $newLines.Add($line)
    }
}

Set-Content -Path $path -Value $newLines -Encoding UTF8
Write-Host "DONE - index.html updated."