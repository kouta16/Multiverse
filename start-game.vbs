Option Explicit
Dim shell, fso, dir, http, ok, i

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

dir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = dir

' Start the game server hidden (no console window)
shell.Run "cmd /c node server\index.js", 0, False

' Wait until the server responds (up to ~8 seconds)
Set http = CreateObject("MSXML2.XMLHTTP")
ok = False
For i = 1 To 16
    WScript.Sleep 500
    On Error Resume Next
    http.Open "GET", "http://localhost:3000/", False
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
    shell.Run "http://localhost:3000"
Else
    MsgBox "اللعبة مش شغالة. تأكد إن Node.js متثبت، او جرّب تشغل server\index.js يدوي." , vbExclamation, "مالتيفرس"
End If
