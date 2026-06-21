#include "P4CommandLineSourceControlUtils.h"
#include "P4CommandLineSourceControlModule.h"
#include "P4CommandLineSourceControlState.h"
#include "P4CommandLineSourceControlRevision.h"
#include "HAL/PlatformFilemanager.h"
#include "HAL/PlatformProcess.h"
#include "Misc/Paths.h"
#include "Misc/FileHelper.h"
#include "GenericPlatform/GenericPlatformFile.h"

bool FP4CommandLineSourceControlUtils::ParseStatusResult(const FString& InResults, TArray<FSourceControlStateRef>& OutStates)
{
    TArray<FString> Lines;
    InResults.ParseIntoArray(Lines, TEXT("\n"), true);
    
    TSharedPtr<FP4CommandLineSourceControlState> CurrentState;
    
    for (FString Line : Lines)
    {
        Line = Line.TrimStartAndEnd();
        if (Line.IsEmpty())
        {
            continue;
        }
        
        if (Line.StartsWith(TEXT("... depotFile")))
        {
            if (CurrentState.IsValid())
            {
                OutStates.Add(CurrentState.ToSharedRef());
            }
            
            FString DepotPath = Line.RightChop(14).TrimStartAndEnd();
            CurrentState = MakeShareable(new FP4CommandLineSourceControlState(TEXT("")));
            CurrentState->DepotFilename = DepotPath;
        }
        else if (Line.StartsWith(TEXT("... clientFile")))
        {
            if (CurrentState.IsValid())
            {
                CurrentState->LocalFilename = Line.RightChop(15).TrimStartAndEnd();
            }
        }
        else if (Line.StartsWith(TEXT("... headRev")))
        {
            if (CurrentState.IsValid())
            {
                CurrentState->HeadRevision = FCString::Atoi(*Line.RightChop(12).TrimStartAndEnd());
            }
        }
        else if (Line.StartsWith(TEXT("... haveRev")))
        {
            if (CurrentState.IsValid())
            {
                CurrentState->HaveRevision = FCString::Atoi(*Line.RightChop(12).TrimStartAndEnd());
            }
        }
        else if (Line.StartsWith(TEXT("... action")))
        {
            if (CurrentState.IsValid())
            {
                CurrentState->Action = Line.RightChop(11).TrimStartAndEnd();
            }
        }
        else if (Line.StartsWith(TEXT("... otherOpen")))
        {
            if (CurrentState.IsValid())
            {
                int32 OtherOpen = FCString::Atoi(*Line.RightChop(14).TrimStartAndEnd());
                CurrentState->bOtherOpen = (OtherOpen > 0);
            }
        }
        else if (Line.StartsWith(TEXT("... otherOpen0")))
        {
            if (CurrentState.IsValid())
            {
                FString OtherOpenInfo = Line.RightChop(15).TrimStartAndEnd();
                TArray<FString> Parts;
                OtherOpenInfo.ParseIntoArray(Parts, TEXT("-"), true);
                if (Parts.Num() >= 2)
                {
                    CurrentState->OtherUserCheckedOut = Parts[1];
                }
            }
        }
    }
    
    if (CurrentState.IsValid())
    {
        OutStates.Add(CurrentState.ToSharedRef());
    }
    
    return true;
}

bool FP4CommandLineSourceControlUtils::ParseFileLogResult(const FString& InResults, TArray<TSharedRef<FP4CommandLineSourceControlRevision, ESPMode::ThreadSafe>>& OutRevisions)
{
    TArray<FString> Lines;
    InResults.ParseIntoArray(Lines, TEXT("\n"), true);
    
    TSharedPtr<FP4CommandLineSourceControlRevision> CurrentRevision;
    
    for (FString Line : Lines)
    {
        Line = Line.TrimStartAndEnd();
        if (Line.IsEmpty())
        {
            continue;
        }
        
        if (Line.StartsWith(TEXT("... #")))
        {
            if (CurrentRevision.IsValid())
            {
                OutRevisions.Add(CurrentRevision.ToSharedRef());
            }
            
            FString RevisionStr = Line.Mid(5);
            int32 SpaceIndex = 0;
            if (RevisionStr.FindChar(TEXT(' '), SpaceIndex))
            {
                FString RevNum = RevisionStr.Left(SpaceIndex);
                int32 Rev = FCString::Atoi(*RevNum);
                FString ChangeStr = RevisionStr.Mid(SpaceIndex + 1);
                int32 Change = 0;
                int32 ChangeIndex = 0;
                if (ChangeStr.FindChar(TEXT(' '), ChangeIndex))
                {
                    Change = FCString::Atoi(*ChangeStr.Left(ChangeIndex).Replace(TEXT("change"), TEXT("")).TrimStartAndEnd());
                }
                
                CurrentRevision = MakeShareable(new FP4CommandLineSourceControlRevision());
                CurrentRevision->Update(TEXT(""), Rev, TEXT(""), TEXT(""), FDateTime::MinValue(), TEXT(""), Change);
            }
        }
        else if (Line.StartsWith(TEXT("... ... ")) && CurrentRevision.IsValid())
        {
            FString Content = Line.RightChop(8).TrimStartAndEnd();
            if (Content.StartsWith(TEXT("date")))
            {
                FString DateStr = Content.RightChop(5).TrimStartAndEnd();
                FDateTime Date;
                FDateTime::Parse(DateStr, Date);
                CurrentRevision->Update(CurrentRevision->GetFilename(), CurrentRevision->GetRevisionNumber(), CurrentRevision->GetDescription(), CurrentRevision->GetUserName(), Date, CurrentRevision->GetAction(), CurrentRevision->GetCheckInIdentifier());
            }
            else if (Content.StartsWith(TEXT("user")))
            {
                FString User = Content.RightChop(5).TrimStartAndEnd();
                CurrentRevision->Update(CurrentRevision->GetFilename(), CurrentRevision->GetRevisionNumber(), CurrentRevision->GetDescription(), User, CurrentRevision->GetDate(), CurrentRevision->GetAction(), CurrentRevision->GetCheckInIdentifier());
            }
            else if (Content.StartsWith(TEXT("client")))
            {
                FString Client = Content.RightChop(7).TrimStartAndEnd();
                // Store client if needed
            }
            else if (Content.StartsWith(TEXT("desc")))
            {
                FString Desc = Content.RightChop(5).TrimStartAndEnd();
                CurrentRevision->Update(CurrentRevision->GetFilename(), CurrentRevision->GetRevisionNumber(), Desc, CurrentRevision->GetUserName(), CurrentRevision->GetDate(), CurrentRevision->GetAction(), CurrentRevision->GetCheckInIdentifier());
            }
            else if (Content.StartsWith(TEXT("action")))
            {
                FString Action = Content.RightChop(7).TrimStartAndEnd();
                CurrentRevision->Update(CurrentRevision->GetFilename(), CurrentRevision->GetRevisionNumber(), CurrentRevision->GetDescription(), CurrentRevision->GetUserName(), CurrentRevision->GetDate(), Action, CurrentRevision->GetCheckInIdentifier());
            }
        }
    }
    
    if (CurrentRevision.IsValid())
    {
        OutRevisions.Add(CurrentRevision.ToSharedRef());
    }
    
    return true;
}

bool FP4CommandLineSourceControlUtils::ParseAnnotateResult(const FString& InResults, TArray<FAnnotationLine>& OutLines)
{
    TArray<FString> Lines;
    InResults.ParseIntoArray(Lines, TEXT("\n"), true);
    
    for (const FString& Line : Lines)
    {
        FString Trimmed = Line.TrimStartAndEnd();
        if (Trimmed.IsEmpty() || Trimmed.StartsWith(TEXT("...")))
        {
            continue;
        }
        
        // Simple annotation line parsing: revision number followed by content
        int32 TabIndex = 0;
        if (Trimmed.FindChar(TEXT('\t'), TabIndex))
        {
            FString RevStr = Trimmed.Left(TabIndex);
            int32 Revision = FCString::Atoi(*RevStr);
            FString Content = Trimmed.Mid(TabIndex + 1);
            
            FAnnotationLine AnnotationLine(Revision, TEXT(""), Content);
        }
    }
    
    return true;
}

bool FP4CommandLineSourceControlUtils::ParseInfoResult(const FString& InResults, FString& OutUserName, FString& OutClientName, FString& OutServerAddress)
{
    TArray<FString> Lines;
    InResults.ParseIntoArray(Lines, TEXT("\n"), true);
    
    for (const FString& Line : Lines)
    {
        FString Trimmed = Line.TrimStartAndEnd();
        if (Trimmed.StartsWith(TEXT("User name:")))
        {
            OutUserName = Trimmed.RightChop(11).TrimStartAndEnd();
        }
        else if (Trimmed.StartsWith(TEXT("Client name:")))
        {
            OutClientName = Trimmed.RightChop(13).TrimStartAndEnd();
        }
        else if (Trimmed.StartsWith(TEXT("Server address:")))
        {
            OutServerAddress = Trimmed.RightChop(16).TrimStartAndEnd();
        }
    }
    
    return true;
}

bool FP4CommandLineSourceControlUtils::RunP4Command(const FString& InCommand, const FString& InParameters, FString& OutResults, FString& OutErrors, int32& OutReturnCode)
{
    return RunP4Command(InCommand, InParameters, FString(), FString(), FString(), FString(), FString(), OutResults, OutErrors, OutReturnCode);
}

bool FP4CommandLineSourceControlUtils::RunP4Command(const FString& InCommand, const FString& InParameters, const FString& InP4Port, const FString& InP4User, const FString& InP4Client, const FString& InP4Password, const FString& InP4ExecutablePath, FString& OutResults, FString& OutErrors, int32& OutReturnCode)
{
    FString P4Path = GetP4ExecutablePath(InP4ExecutablePath);
    UE_LOG(LogP4CommandLine, Log, TEXT("P4CommandLine: Using p4 executable: %s"), *P4Path);
    if (P4Path.IsEmpty())
    {
        OutErrors = TEXT("p4 executable not found. Please install p4 or set P4 Executable Path in Project Settings > Plugins > P4 Command Line Source Control.");
        OutReturnCode = -1;
        return false;
    }
    
    FString CredentialsPrefix;
    if (!InP4Port.IsEmpty())
    {
        CredentialsPrefix += FString::Printf(TEXT("-p %s "), *InP4Port);
    }
    if (!InP4User.IsEmpty())
    {
        CredentialsPrefix += FString::Printf(TEXT("-u %s "), *InP4User);
    }
    if (!InP4Client.IsEmpty())
    {
        CredentialsPrefix += FString::Printf(TEXT("-c %s "), *InP4Client);
    }
    if (!InP4Password.IsEmpty())
    {
        CredentialsPrefix += FString::Printf(TEXT("-P %s "), *InP4Password);
    }
    
    FString FullParameters = FString::Printf(TEXT("%s%s %s"), *CredentialsPrefix, *InCommand, *InParameters);
    UE_LOG(LogP4CommandLine, Log, TEXT("P4CommandLine: Executing: %s %s"), *P4Path, *FullParameters);
    
    void* ReadPipe = nullptr;
    void* WritePipe = nullptr;
    
    FPlatformProcess::CreatePipe(ReadPipe, WritePipe);
    
    FProcHandle ProcessHandle = FPlatformProcess::CreateProc(
        *P4Path,
        *FullParameters,
        false,
        false,
        false,
        nullptr,
        0,
        nullptr,
        WritePipe
    );
    
    if (!ProcessHandle.IsValid())
    {
        FPlatformProcess::ClosePipe(ReadPipe, WritePipe);
        OutErrors = FString::Printf(TEXT("Failed to start p4 process: %s %s"), *P4Path, *FullParameters);
        OutReturnCode = -1;
        UE_LOG(LogP4CommandLine, Error, TEXT("P4CommandLine: %s"), *OutErrors);
        return false;
    }
    
    FPlatformProcess::WaitForProc(ProcessHandle);
    
    OutResults = FPlatformProcess::ReadPipe(ReadPipe);
    
    FPlatformProcess::GetProcReturnCode(ProcessHandle, &OutReturnCode);
    
    FPlatformProcess::CloseProc(ProcessHandle);
    FPlatformProcess::ClosePipe(ReadPipe, WritePipe);
    
    UE_LOG(LogP4CommandLine, Log, TEXT("P4CommandLine: ReturnCode=%d, Results=%s, Errors=%s"), OutReturnCode, *OutResults, *OutErrors);
    
    if (OutReturnCode != 0)
    {
        OutErrors = OutResults;
        OutResults.Empty();
    }
    
    return OutReturnCode == 0;
}

FString FP4CommandLineSourceControlUtils::GetP4ExecutablePath(const FString& InConfiguredPath)
{
    // 1. Prefer user-configured path
    if (!InConfiguredPath.IsEmpty() && FPaths::FileExists(InConfiguredPath))
    {
        UE_LOG(LogP4CommandLine, Log, TEXT("P4CommandLine: Using configured p4 path: %s"), *InConfiguredPath);
        return InConfiguredPath;
    }
    
    // 2. Try to find p4 in PATH via which
    #if PLATFORM_UNIX || PLATFORM_MAC
    FString Results, Errors;
    int32 ReturnCode = 0;
    FPlatformProcess::ExecProcess(TEXT("/bin/sh"), TEXT("-c 'which p4'"), &ReturnCode, &Results, &Errors);
    if (ReturnCode == 0)
    {
        FString Path = Results.TrimStartAndEnd();
        if (FPaths::FileExists(Path))
        {
            UE_LOG(LogP4CommandLine, Log, TEXT("P4CommandLine: Found p4 via which: %s"), *Path);
            return Path;
        }
    }
    #endif
    
    // 3. Search common installation paths
    const TArray<FString> CommonPaths = {
        TEXT("/usr/local/bin/p4"),
        TEXT("/opt/homebrew/bin/p4"),
        TEXT("/usr/bin/p4"),
        TEXT("/bin/p4"),
        TEXT("/opt/local/bin/p4"),
        TEXT("/Applications/p4v.app/Contents/MacOS/p4")
    };
    
    for (const FString& Path : CommonPaths)
    {
        if (FPaths::FileExists(Path))
        {
            UE_LOG(LogP4CommandLine, Log, TEXT("P4CommandLine: Found p4 at common path: %s"), *Path);
            return Path;
        }
    }
    
    // 4. Fallback - let the OS resolve it
    UE_LOG(LogP4CommandLine, Warning, TEXT("P4CommandLine: Could not locate p4 executable. Tried 'which p4' and common paths. Falling back to 'p4' and hoping it's in PATH."));
    return TEXT("p4");
}

FString FP4CommandLineSourceControlUtils::SanitizeFilename(const FString& InFilename)
{
    // Ensure path uses forward slashes and is properly quoted if needed
    FString Sanitized = InFilename;
    Sanitized = Sanitized.Replace(TEXT("\\"), TEXT("/"));
    
    // Quote the filename if it contains spaces
    if (Sanitized.Contains(TEXT(" ")))
    {
        Sanitized = FString::Printf(TEXT("\"%s\""), *Sanitized);
    }
    
    return Sanitized;
}

FString FP4CommandLineSourceControlUtils::GetDepotPath(const FString& InLocalFilename)
{
    // This is a placeholder - in real implementation, would use p4 where or mapping
    return InLocalFilename;
}

FString FP4CommandLineSourceControlUtils::GetLocalPath(const FString& InDepotFilename)
{
    // This is a placeholder - in real implementation, would use p4 where or mapping
    return InDepotFilename;
}
