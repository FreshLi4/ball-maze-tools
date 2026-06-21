#pragma once

#include "CoreMinimal.h"
#include "ISourceControlState.h"
#include "ISourceControlRevision.h"
#include "Misc/DateTime.h"

class FP4CommandLineSourceControlState : public ISourceControlState
{
public:
    FP4CommandLineSourceControlState(const FString& InLocalFilename)
        : LocalFilename(InLocalFilename)
        , HeadRevision(0)
        , HaveRevision(0)
        , TimeStamp(0)
        , bOtherOpen(false)
        , bCanDelete(false)
        , bCanAdd(false)
        , bCanCheckOut(false)
        , bCanRevert(false)
        , bCanCheckIn(false)
        , bCanDiffAgainstWorkspace(false)
    {}

    // ISourceControlState interface
    virtual int32 GetHistorySize() const override;
    virtual TSharedPtr<class ISourceControlRevision, ESPMode::ThreadSafe> GetHistoryItem(int32 HistoryIndex) const override;
    virtual TSharedPtr<class ISourceControlRevision, ESPMode::ThreadSafe> FindHistoryRevision(int32 RevisionNumber) const override;
    virtual TSharedPtr<class ISourceControlRevision, ESPMode::ThreadSafe> FindHistoryRevision(const FString& InRevision) const override;
    virtual TSharedPtr<class ISourceControlRevision, ESPMode::ThreadSafe> GetCurrentRevision() const override;
    virtual FResolveInfo GetResolveInfo() const override;
    virtual FSlateIcon GetIcon() const override;
    virtual FText GetDisplayName() const override;
    virtual FText GetDisplayTooltip() const override;
    virtual const FString& GetFilename() const override;
    virtual const FDateTime& GetTimeStamp() const override;
    virtual bool CanCheckIn() const override;
    virtual bool CanCheckout() const override;
    virtual bool IsCheckedOut() const override;
    virtual bool IsCheckedOutOther(FString* Who = nullptr) const override;
    virtual bool IsCheckedOutInOtherBranch(const FString& CurrentBranch = FString()) const override { return false; }
    virtual bool IsModifiedInOtherBranch(const FString& CurrentBranch = FString()) const override { return false; }
    virtual bool IsCheckedOutOrModifiedInOtherBranch(const FString& CurrentBranch = FString()) const override { return IsCheckedOutInOtherBranch(CurrentBranch) || IsModifiedInOtherBranch(CurrentBranch); }
    virtual TArray<FString> GetCheckedOutBranches() const override { return TArray<FString>(); }
    virtual FString GetOtherUserBranchCheckedOuts() const override { return FString(); }
    virtual bool GetOtherBranchHeadModification(FString& HeadBranchOut, FString& ActionOut, int32& HeadChangeListOut) const override { return false; }
    virtual bool IsCurrent() const override;
    virtual bool IsSourceControlled() const override;
    virtual bool IsAdded() const override;
    virtual bool IsDeleted() const override;
    virtual bool IsIgnored() const override;
    virtual bool CanEdit() const override;
    virtual bool CanDelete() const override;
    virtual bool IsUnknown() const override;
    virtual bool IsModified() const override;
    virtual bool CanAdd() const override;
    virtual bool IsConflicted() const override;
    virtual bool CanRevert() const override;

    void Update(const FString& InAction, int32 InHeadRevision, int32 InHaveRevision, bool bInOtherOpen, const FString& InOtherUser);

    const FString& GetLocalFilename() const { return LocalFilename; }

public:
    FString LocalFilename;
    FString DepotFilename;
    FString Action;
    FString OtherUserCheckedOut;
    int32 HeadRevision;
    int32 HaveRevision;
    FDateTime TimeStamp;
    bool bOtherOpen;
    bool bCanDelete;
    bool bCanAdd;
    bool bCanCheckOut;
    bool bCanRevert;
    bool bCanCheckIn;
    bool bCanDiffAgainstWorkspace;
    FResolveInfo ResolveInfo;
    TArray<FSourceControlRevisionRef> History;
};
