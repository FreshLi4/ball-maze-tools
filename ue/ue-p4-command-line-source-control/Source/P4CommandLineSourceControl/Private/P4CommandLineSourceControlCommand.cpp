#include "P4CommandLineSourceControlCommand.h"
#include "P4CommandLineSourceControlUtils.h"
#include "HAL/PlatformFilemanager.h"
#include "HAL/PlatformProcess.h"
#include "Misc/Paths.h"

FP4CommandLineSourceControlCommand::FP4CommandLineSourceControlCommand(const FString& InCommand, const FString& InParameters)
    : Command(InCommand)
    , Parameters(InParameters)
{
}

bool FP4CommandLineSourceControlCommand::RunCommand()
{
    FString P4Path = FP4CommandLineSourceControlUtils::GetP4ExecutablePath();
    if (P4Path.IsEmpty())
    {
        Errors = TEXT("p4 executable not found in PATH");
        return false;
    }

    FString FullCommand = FString::Printf(TEXT("%s %s"), *Command, *Parameters);
    
    void* ReadPipe = nullptr;
    void* WritePipe = nullptr;
    
    FPlatformProcess::CreatePipe(ReadPipe, WritePipe);
    
    FProcHandle ProcessHandle = FPlatformProcess::CreateProc(
        *P4Path,
        *FullCommand,
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
        Errors = FString::Printf(TEXT("Failed to start p4 process: %s"), *FullCommand);
        return false;
    }
    
    FPlatformProcess::WaitForProc(ProcessHandle);
    
    Results = FPlatformProcess::ReadPipe(ReadPipe);
    
    int32 ReturnCode = 0;
    FPlatformProcess::GetProcReturnCode(ProcessHandle, ReturnCode);
    this->ReturnCode = ReturnCode;
    
    FPlatformProcess::CloseProc(ProcessHandle);
    FPlatformProcess::ClosePipe(ReadPipe, WritePipe);
    
    if (ReturnCode != 0)
    {
        Errors = Results;
        Results.Empty();
    }
    
    return ReturnCode == 0;
}
