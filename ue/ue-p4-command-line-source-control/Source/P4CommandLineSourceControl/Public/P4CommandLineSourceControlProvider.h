#pragma once

#include "CoreMinimal.h"
#include "ISourceControlProvider.h"
#include "ISourceControlState.h"
#include "ISourceControlOperation.h"
#include "P4CommandLineSourceControlCommand.h"

class FP4CommandLineSourceControlProvider : public ISourceControlProvider
{
public:
    FP4CommandLineSourceControlProvider();

    virtual void Init(bool bForceConnection = true) override;
    virtual void Close() override;

    virtual bool IsAvailable() const override;
    virtual bool IsEnabled() const override;
    virtual bool IsAuthenticated() const override;

    virtual const FName& GetName() const override;
    virtual FText GetDisplayName() const override;
    virtual FText GetStatusText() const override;
    virtual bool LearnMore(TArray<FString>& OutInfo) const override;
    virtual bool Login(const FString& InUsername, const FString& InPassword, const FSourceControlLoginClosed& InOnSourceControlLoginClosed) override;
    virtual bool Logout() override;

    virtual const TArray<FSourceControlStateRef>& GetCachedStateByPredicate(TFunctionRef<bool(const FSourceControlStateRef&)> Predicate) const override;
    virtual FSourceControlStatePtr GetState(const FString& Filename, const FName& InBranch = FName()) const override;
    virtual TArray<FSourceControlStateRef> GetState(const TArray<FString>& Filenames, const FName& InBranch = FName()) override;
    virtual void UpdateState(const TArray<FSourceControlStateRef>& InSourceControlStates) override;

    virtual bool CanCancelOperation() const override;
    virtual void CancelOperation() override;

    virtual bool IsOperationValid(const FSourceControlOperationRef& InOperation) const override;
    virtual TSharedRef<class ISourceControlOperation, ESPMode::ThreadSafe> CreateOperation(const FName& InOperationName) override;
    virtual bool CanExecuteOperation(const FName& InOperationName) const override;
    virtual bool Execute(const FSourceControlOperationRef& InOperation, const FSourceControlOperationComplete& InOperationCompleteDelegate = FSourceControlOperationComplete(), EConcurrency::Type InConcurrency = EConcurrency::Synchronous, const FName& InBranch = FName()) override;

    virtual bool CanUpdateStatus() const override;
    virtual bool UpdateStatus() override;

    virtual bool CanDiffAgainstBase(const FString& InFilename) const override;
    virtual bool CanDiffAgainstLocal(const FString& InFilename) const override;
    virtual bool DiffAgainstBase(const FString& InFilename) const override;
    virtual bool DiffAgainstLocal(const FString& InFilename) const override;

    virtual bool GetHistory(const FString& InFilename, TArray<FSourceControlRevisionRef>& OutHistory) override;

    virtual bool CanUpdateHistory() const override;
    virtual bool UpdateHistory() override;

    virtual bool GetWorkspaces(TArray<FString>& OutWorkspaces) override;
    virtual bool SwitchWorkspace(const FString& InWorkspaceName) override;

    void RegisterWorker(const FName& InName, FGetP4SourceControlWorker InDelegate);

private:
    bool CheckP4Availability();
    bool ExecuteSynchronousCommand(FP4CommandLineSourceControlCommand& InCommand, const FText& TaskName);
    bool ExecuteAsynchronousCommand(FP4CommandLineSourceControlCommand& InCommand);
    bool ParseStatusResults(const FString& InResults, TArray<FSourceControlStateRef>& OutStates);

    bool bSourceControlAvailable = false;
    FName ProviderName;
    TMap<FString, FSourceControlStateRef> CachedStates;
    TMap<FName, FGetP4SourceControlWorker> WorkersMap;
};
