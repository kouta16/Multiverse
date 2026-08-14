Option Explicit
Dim shell, fso, dir, http, ok, i, url

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

dir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = dir

' Start the game server hidden (no console window) — safe even if already running
shell.Run "cmd /c node server\index.js", 0, False

' Wait until the server responds (up to ~8 seconds)
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

If ok Then
    ' ?android=1 يفرض تصميم الأندرويد، والتابلة بتمسح العنوان القديم تلقائيًا
    url = "http://localhost:3000/?android=1"
    shell.Run url
Else
    MsgBox "السيرفر مش شغال. تأكد إن Node.js متثبت، او جرّب تشغل server\index.js يدوي." , vbExclamation, "مالتيفرس"
End If