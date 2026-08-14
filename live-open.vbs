Option Explicit

' ============================================================
'  Multiverse LIVE — افتح النسخة التجريبية الحية على الموبايل
'  1) يشغل السيرفر لو مش شغال
'  2) يعمل adb reverse (موبايل -> كومبيوتر)
'  3) يفتح لعبة "مالتيفرس (تجريب)" على الموبايل
'  المتطلب: الموبايل متصل بالكومبيوتر بالكابل و"USB debugging" مفعّل
' ============================================================

Dim shell, fso, dir, adb, ok, i, http

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = dir

' ---- حاول تلاقي adb ----
adb = FindAdb()
If adb = "" Then
    MsgBox "مش لاقي adb.exe. تأكد إن Android SDK موجود." , vbExclamation, "مالتيفرس"
    WScript.Quit 1
End If

' ---- شغّل السيرفر (سيف حتى لو شغال) ----
shell.Run "cmd /c node server\index.js", 0, False
Set http = CreateObject("MSXML2.XMLHTTP")
ok = False
For i = 1 To 16
    WScript.Sleep 500
    On Error Resume Next
    http.Open "GET", "http://localhost:3000/__live", False
    http.Send
    If Err.Number = 0 And http.Status = 200 Then
        ok = True
        Err.Clear
        Exit For
    End If
    Err.Clear
    On Error GoTo 0
Next
If Not ok Then
    MsgBox "السيرفر مش شغال. تأكد إن Node.js متثبت." , vbExclamation, "مالتيفرس"
    WScript.Quit 1
End If

' ---- موبايل -> كومبيوتر (النفق) ----
shell.Run """" & adb & """ reverse tcp:3000 tcp:3000", 0, True

' ---- افتح اللعبة على الموبايل ----
shell.Run """" & adb & """ shell am start -n com.multiverse.game/.MainActivity", 0, False

MsgBox "اللعبة اتفتحت على الموبايل. أي تعديل هتعمله هيتحدث فورًا." , vbInformation, "مالتيفرس"

' ---- لو الموبايل مش متصل نبه ----
Function FindAdb()
    Dim env, p, list, x
    FindAdb = ""
    Set env = CreateObject("WScript.Shell")
    Dim fixedCandidates
    fixedCandidates = Array( _
        "C:\Users\kouta\AppData\Local\Temp\opencode\android-sdk\platform-tools\adb.exe", _
        env.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Android\Sdk\platform-tools\adb.exe", _
        "C:\Android\platform-tools\adb.exe")
    For Each p In fixedCandidates
        If fso.FileExists(p) Then
            FindAdb = p
            Exit Function
        End If
    Next
    ' لو مش لاقيه على المسارات المعروفة، جرّب أمر adb نفسه
End Function