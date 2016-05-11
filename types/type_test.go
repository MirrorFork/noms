package types

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestTypes(t *testing.T) {
	assert := assert.New(t)
	vs := NewTestValueStore()

	mapType := MakeMapType(StringType, NumberType)
	setType := MakeSetType(StringType)
	mahType := MakeStructType("MahStruct", TypeMap{
		"Field1": StringType,
		"Field2": BoolType,
	})
	recType := MakeStructType("RecursiveStruct", TypeMap{
		"self": nil,
	})
	recType.Desc.(StructDesc).Fields["self"] = recType

	mRef := vs.WriteValue(mapType).TargetRef()
	setRef := vs.WriteValue(setType).TargetRef()
	mahRef := vs.WriteValue(mahType).TargetRef()
	recRef := vs.WriteValue(recType).TargetRef()

	assert.True(mapType.Equals(vs.ReadValue(mRef)))
	assert.True(setType.Equals(vs.ReadValue(setRef)))
	assert.True(mahType.Equals(vs.ReadValue(mahRef)))
	assert.True(recType.Equals(vs.ReadValue(recRef)))
}

func TestTypeType(t *testing.T) {
	assert.True(t, BoolType.Type().Equals(TypeType))
}

func TestTypeRefDescribe(t *testing.T) {
	assert := assert.New(t)
	mapType := MakeMapType(StringType, NumberType)
	setType := MakeSetType(StringType)

	assert.Equal("Bool", BoolType.Describe())
	assert.Equal("Number", NumberType.Describe())
	assert.Equal("String", StringType.Describe())
	assert.Equal("Map<String, Number>", mapType.Describe())
	assert.Equal("Set<String>", setType.Describe())

	mahType := MakeStructType("MahStruct", TypeMap{
		"Field1": StringType,
		"Field2": BoolType,
	})
	assert.Equal("struct MahStruct {\n  Field1: String\n  Field2: Bool\n}", mahType.Describe())
}

func TestTypeOrdered(t *testing.T) {
	assert := assert.New(t)
	assert.False(BoolType.IsOrdered())
	assert.True(NumberType.IsOrdered())
	assert.True(StringType.IsOrdered())
	assert.False(BlobType.IsOrdered())
	assert.False(ValueType.IsOrdered())
	assert.False(MakeListType(StringType).IsOrdered())
	assert.False(MakeSetType(StringType).IsOrdered())
	assert.False(MakeMapType(StringType, ValueType).IsOrdered())
	assert.True(MakeRefType(StringType).IsOrdered())
}

func TestVerifyFieldName(t *testing.T) {
	assert := assert.New(t)

	assertInvalid := func(n string) {
		assert.Panics(func() {
			MakeStructType("S", TypeMap{n: StringType})
		})
	}
	assertInvalid("")
	assertInvalid(" ")
	assertInvalid(" a")
	assertInvalid("a ")
	assertInvalid("0")
	assertInvalid("_")
	assertInvalid("0a")
	assertInvalid("_a")

	assertValid := func(n string) {
		MakeStructType("S", TypeMap{n: StringType})
	}
	assertValid("a")
	assertValid("A")
	assertValid("a0")
	assertValid("a_")
	assertValid("a0_")
}
