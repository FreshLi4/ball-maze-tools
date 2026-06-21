#include "P4CommandLineSourceControlRevision.h"

bool FP4CommandLineSourceControlRevision::Get(FString& InOutFilename, EConcurrency::Type InConcurrency) const
{
    return false;
}

bool FP4CommandLineSourceControlRevision::GetAnnotated(TArray<FAnnotationLine>& OutLines) const
{
    return false;
}

bool FP4CommandLineSourceControlRevision::GetAnnotated(FString& InOutFilename) const
{
    TArray<FAnnotationLine> Lines;
    return GetAnnotated(Lines);
}

const FString& FP4CommandLineSourceControlRevision::GetFilename() const
{
    return Filename;
}

int32 FP4CommandLineSourceControlRevision::GetRevisionNumber() const
{
    return RevisionNumber;
}

const FString& FP4CommandLineSourceControlRevision::GetRevision() const
{
    return Revision;
}

const FString& FP4CommandLineSourceControlRevision::GetDescription() const
{
    return Description;
}

const FString& FP4CommandLineSourceControlRevision::GetUserName() const
{
    return UserName;
}

const FString& FP4CommandLineSourceControlRevision::GetClientSpec() const
{
    return ClientSpec;
}

const FString& FP4CommandLineSourceControlRevision::GetAction() const
{
    return Action;
}

TSharedPtr<class ISourceControlRevision, ESPMode::ThreadSafe> FP4CommandLineSourceControlRevision::GetBranchSource() const
{
    return BranchSource;
}

const FDateTime& FP4CommandLineSourceControlRevision::GetDate() const
{
    return Date;
}

int32 FP4CommandLineSourceControlRevision::GetCheckInIdentifier() const
{
    return ChangeList;
}

int32 FP4CommandLineSourceControlRevision::GetFileSize() const
{
    return FileSize;
}

void FP4CommandLineSourceControlRevision::Update(const FString& InFilename, int32 InRevision, const FString& InDescription, const FString& InUserName, const FDateTime& InDate, const FString& InAction, int32 InChangeList)
{
    Filename = InFilename;
    RevisionNumber = InRevision;
    Revision = FString::Printf(TEXT("%d"), InRevision);
    Description = InDescription;
    UserName = InUserName;
    Date = InDate;
    Action = InAction;
    ChangeList = InChangeList;
}
